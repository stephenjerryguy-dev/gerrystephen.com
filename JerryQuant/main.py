"""JerryQuant — cautious, capital-preservation-first trading assistant.

Usage:
    python main.py                      # uses mode from config.yaml (BACKTEST)
    python main.py --mode backtest
    python main.py --mode paper
    python main.py --mode live_review
    python main.py --mode live_approved # refuses unless explicitly armed

This system is long-only swing trading on daily bars. It does not scalp,
use margin, leverage, options, or shorts, and it will not trade when data
is missing or stale. If HALT_TRADING.txt exists, nothing trades.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv
from loguru import logger

from core.config import Config, Mode, load_config
from database.db import Database
from database.models import Direction, Position, SignalType
from reports.trade_journal import TradeJournal
from risk.kill_switch import KillSwitch, TradingHalted

PAPER_STATE_FILE = "paper_state.json"
LIVE_STATE_FILE = "live_state.json"
LIVE_PENDING_FILE = "live_pending.json"
LIVE_PENDING_MD = "live_pending.md"
LIVE_PENDING_MAX_AGE_H = 18  # a proposal older than this is stale; execute refuses
LIVE_PROPOSAL_STATUSES_SUPPRESS = {"proposed", "approved", "executed", "rejected"}


def setup_logging(cfg: Config) -> None:
    log_dir = BASE_DIR / cfg.logging.dir
    log_dir.mkdir(exist_ok=True)
    logger.remove()
    logger.add(sys.stderr, level=cfg.logging.level)
    logger.add(
        log_dir / "jerryquant_{time:YYYY-MM-DD}.log",
        level=cfg.logging.level,
        rotation="1 day",
        retention="90 days",
    )


def fetch_all_data(cfg: Config, check_fresh: bool) -> dict:
    """Fetch daily bars for the whole watchlist. Assets with bad/stale data
    are dropped (never traded) and reported."""
    from data_sources import crypto_data, market_data

    data = {}
    for asset in cfg.watchlist.crypto:
        try:
            df = crypto_data.fetch_daily(asset, cfg)
            if check_fresh:
                crypto_data.check_freshness(df, asset, cfg)
            data[asset] = df
        except market_data.DataUnavailableError as e:
            logger.warning(f"Skipping {asset}: {e}")
    for asset in cfg.watchlist.equities:
        try:
            df = market_data.fetch_daily(asset, history_days=cfg.data.history_days)
            if check_fresh:
                market_data.check_freshness(
                    df, cfg.data.max_staleness_hours_equity, asset
                )
            data[asset] = df
        except market_data.DataUnavailableError as e:
            logger.warning(f"Skipping {asset}: {e}")
    return data


def run_backtest_mode(cfg: Config, journal: TradeJournal) -> int:
    from backtesting.backtest_engine import run_backtest

    logger.info("Fetching historical data for backtest...")
    data = fetch_all_data(cfg, check_fresh=False)
    if not data:
        logger.error("No usable data for any watchlist asset. Aborting.")
        return 1

    start = cfg.backtest.start_date
    end = cfg.backtest.end_date
    for asset in data:
        df = data[asset]
        df = df[df.index >= start]
        if end:
            df = df[df.index <= end]
        data[asset] = df

    logger.info(f"Running backtest on {', '.join(data)} from {start}...")
    result = run_backtest(data, cfg)

    print("\n" + "=" * 62)
    print("BACKTEST RESULTS")
    print("=" * 62)
    print(result.report.render())
    if result.halted:
        print(f"\n  NOTE: backtest HALTED early — {result.halt_reason}")
    if result.skipped_signals:
        print(f"  Signals skipped by risk gates: {result.skipped_signals}")
    if result.regime_blocked:
        print(f"  Days new entries blocked by regime: {result.regime_blocked}")
    print("=" * 62)

    for t in result.trades:
        journal.record_trade(t, mode="BACKTEST")
    logger.info(f"{len(result.trades)} backtest trades journaled.")
    return 0


def _load_paper_state(broker, path: Path) -> None:
    if not path.exists():
        return
    state = json.loads(path.read_text())
    broker.cash = state["cash"]
    for p in state["positions"]:
        broker.positions[p["asset"]] = Position(
            asset=p["asset"],
            direction=Direction(p["direction"]),
            size=p["size"],
            entry_price=p["entry_price"],
            stop=p["stop"],
            target=p["target"],
            opened_at=datetime.fromisoformat(p["opened_at"]),
            strategy=p["strategy"],
            dollar_risk=p["dollar_risk"],
        )
        broker.positions[p["asset"]]._scaled_out = p.get("scaled_out", False)
        broker._entry_fees[p["asset"]] = p.get("entry_fee", 0.0)


def _save_paper_state(broker, path: Path) -> None:
    state = {
        "cash": broker.cash,
        "positions": [
            {
                "asset": p.asset,
                "direction": p.direction.value,
                "size": p.size,
                "entry_price": p.entry_price,
                "stop": p.stop,
                "target": p.target,
                "opened_at": p.opened_at.isoformat(),
                "strategy": p.strategy,
                "dollar_risk": p.dollar_risk,
                "entry_fee": broker._entry_fees.get(p.asset, 0.0),
                "scaled_out": getattr(p, "_scaled_out", False),
            }
            for p in broker.positions.values()
        ],
    }
    path.write_text(json.dumps(state, indent=2))


def run_signal_cycle(cfg: Config, journal: TradeJournal,
                     kill_switch: KillSwitch, execute: bool) -> int:
    """One daily cycle: manage positions, generate signals, act per mode.

    execute=True  -> PAPER mode (auto-fill on paper broker)
    execute=False -> LIVE_REVIEW mode (tickets displayed + journaled only)
    """
    from data_sources import sentiment_data, prediction_market_data
    from execution import order_manager
    from execution.paper_broker import OrderRejected, PaperBroker
    from reports import daily_report
    from risk import correlation, regime_filter
    from risk.drawdown_guard import DrawdownGuard
    from risk.position_sizing import PositionSizeError
    from strategies import prediction_market_signal, signal_aggregator, trend_following

    broker = PaperBroker(cfg, kill_switch)
    state_path = BASE_DIR / PAPER_STATE_FILE
    if execute:
        _load_paper_state(broker, state_path)

    data = fetch_all_data(cfg, check_fresh=True)
    missed: list[str] = []
    for asset in cfg.watchlist.all_assets:
        if asset not in data:
            missed.append(f"{asset}: no fresh data — not traded (by rule)")

    prices = {a: float(df["close"].iloc[-1]) for a, df in data.items()}

    tf = cfg.strategy.trend_following

    # --- manage existing positions ---
    if execute:
        # Ratchet trailing stops before the stop/target sweep.
        if tf.use_trailing_stop:
            for asset, pos in broker.positions.items():
                if asset in data:
                    ind = trend_following.compute_indicators(data[asset], cfg)
                    pos.stop = trend_following.compute_trailing_stop(
                        ind, cfg, pos.stop
                    )
        for t in broker.check_stops_and_targets(prices):
            journal.record_trade(t, mode="PAPER")
            logger.info(f"Closed {t.asset}: {t.exit_reason}, P&L ${t.pnl:+.2f}")
        for asset in list(broker.positions.keys()):
            if asset not in data:
                continue
            pos = broker.positions[asset]
            ind = trend_following.compute_indicators(data[asset], cfg)
            days_held = max(0, (datetime.now(timezone.utc) - pos.opened_at).days)
            reason = (
                trend_following.time_stop_reason(
                    days_held, pos.entry_price, prices[asset], cfg)
                or trend_following.should_exit(ind, cfg)
            )
            if reason:
                t = broker.close_long(asset, prices[asset], reason)
                journal.record_trade(t, mode="PAPER")
                logger.info(f"Closed {asset}: {reason}, P&L ${t.pnl:+.2f}")
                continue
            # Partial profit-take (scale-out) at the configured R multiple.
            units = trend_following.scale_out_units(
                pos.entry_price, pos.size, pos.dollar_risk, prices[asset], cfg,
                getattr(pos, "_scaled_out", False),
            )
            if units > 0:
                t = broker.scale_out_long(asset, units, prices[asset])
                pos._scaled_out = True
                journal.record_trade(t, mode="PAPER")
                logger.info(f"Scaled out {asset}: {units:.6f}, P&L ${t.pnl:+.2f}")

    equity = broker.equity(prices)
    journal.record_equity(equity, cfg.mode.value)

    # --- drawdown check against journaled equity history ---
    history = journal.db.equity_history(cfg.mode.value)
    guard = DrawdownGuard(
        max_daily_pct=cfg.risk.max_daily_drawdown_pct,
        max_total_pct=cfg.risk.max_total_drawdown_pct,
        max_monthly_pct=cfg.risk.max_monthly_loss_pct,
        starting_equity=history[0][1] if history else equity,
    )
    breaches = []
    for ts_str, eq in history:
        breaches = guard.update(eq, datetime.fromisoformat(ts_str).date())
    for b in breaches:
        kill_switch.engage(str(b))
        journal.record_risk_event("drawdown_breach", str(b))

    # --- generate signals ---
    signals = []
    for asset, df in data.items():
        ind = trend_following.compute_indicators(df, cfg)
        sig = trend_following.evaluate(ind, asset, cfg)
        if sig is None:
            continue
        sentiment = sentiment_data.fetch_sentiment(asset)
        s_adj = sentiment_data.confidence_adjustment(
            sentiment, cfg.signals.sentiment_max_confidence_adjust
        )
        pm_view = prediction_market_signal.assess(
            asset, prediction_market_data.fetch_probabilities(asset), cfg
        )
        sig = signal_aggregator.apply_confidence_adjustments(
            sig, s_adj, pm_view.confidence_adjust, cfg
        )
        journal.record_signal(sig)
        signals.append(sig)

    actionable = signal_aggregator.filter_actionable(signals, cfg)
    logger.info(
        f"{len(signals)} signals evaluated, {len(actionable)} actionable."
    )

    # --- regime gate: no new longs in a bear/chop tape ---
    regime = regime_filter.assess_regime(data, cfg)
    logger.info(regime.render())
    if not regime.risk_on and actionable:
        for sig in actionable:
            missed.append(f"{sig.asset}: signal valid but regime risk-off "
                          f"({'; '.join(regime.reasons)})")
        actionable = []
    closes = {a: df["close"] for a, df in data.items()}

    # --- act on signals ---
    for sig in actionable:
        if not kill_switch.can_trade():
            missed.append(f"{sig.asset}: signal valid but kill switch engaged")
            continue
        try:
            ticket, size = order_manager.build_ticket(
                sig, equity, list(broker.positions.values()), prices, cfg
            )
        except order_manager.TradeBlocked as e:
            missed.append(f"{sig.asset}: blocked — {e}")
            continue
        except PositionSizeError as e:
            kill_switch.engage(f"Position sizing failed for {sig.asset}: {e}")
            journal.record_risk_event("position_sizing_failure", str(e))
            break

        # Correlation haircut + cluster cap.
        mult, note = correlation.correlation_haircut(
            sig.asset, list(broker.positions.values()), closes, cfg
        )
        if mult < 1.0:
            size.units *= mult
            size.value_usd *= mult
            size.dollar_risk *= mult
            logger.info(f"{sig.asset}: {note}")
        cluster_viol = correlation.check_cluster_exposure(
            sig.asset, size.value_usd, equity,
            list(broker.positions.values()), prices, cfg
        )
        if cluster_viol:
            missed.append(f"{sig.asset}: blocked — {'; '.join(cluster_viol)}")
            continue

        if execute:
            try:
                pos = broker.open_long(sig, size.units, prices[sig.asset])
                logger.info(
                    f"PAPER fill: {pos.asset} {pos.size:.6f} @ ${pos.entry_price:,.2f}"
                )
                print(ticket.render())
                print("\nPAPER mode: trade executed on paper broker.")
            except (OrderRejected, TradingHalted) as e:
                missed.append(f"{sig.asset}: order rejected — {e}")
        else:
            outcome = order_manager.handle_live_signal(
                ticket, cfg, kill_switch, execute_fn=lambda t: None
            )
            logger.info(f"{sig.asset}: {outcome}")

    if execute:
        _save_paper_state(broker, state_path)

    # --- daily report ---
    equity = broker.equity(prices)
    peak = max([eq for _, eq in history] + [equity]) if history else equity
    dd = max(0.0, (peak - equity) / peak * 100.0) if peak > 0 else 0.0
    report = daily_report.build_report(
        daily_report.DailyReportData(
            portfolio_value=equity,
            cash=broker.cash,
            open_positions=list(broker.positions.values()),
            position_prices=prices,
            drawdown_pct=dd,
            kill_switch_engaged=not kill_switch.can_trade(),
            kill_switch_reasons=kill_switch.reasons,
            missed_trades=missed,
        ),
        journal,
        cfg,
    )
    daily_report.deliver_report(report, cfg, BASE_DIR)
    return 0


def run_live_approved_mode(cfg: Config, journal: TradeJournal,
                           kill_switch: KillSwitch) -> int:
    from execution.robinhood_mcp_broker import BrokerDisabled, RobinhoodMCPBroker

    broker = RobinhoodMCPBroker(cfg, kill_switch)
    print("LIVE_APPROVED mode requested. Broker status:")
    for k, v in broker.status().items():
        print(f"  {k}: {v}")
    try:
        broker.assert_armed()
    except BrokerDisabled as e:
        print(f"\nRefusing to run live: {e}")
        print("Arming requires: execution.live_trading_enabled: true in "
              "config.yaml, ROBINHOOD_MCP_URL and ROBINHOOD_MCP_API_KEY in "
              ".env, and this LIVE_APPROVED mode.")
        return 1

    # Discovery first: enumerate Robinhood's real MCP tools so order
    # placement is implemented against actual schemas, never guesses.
    print("\nConnecting to Robinhood MCP for tool discovery...")
    try:
        tools = broker.discover()
    except Exception as e:
        kill_switch.engage(f"Robinhood MCP connection failed: {e}")
        journal.record_risk_event("mcp_connection_failed", str(e))
        print(f"MCP connection failed ({e}). Kill switch engaged — delete "
              f"{cfg.execution.halt_file} after investigating.")
        return 1

    print(f"Discovered {len(tools)} tool(s):")
    for t in tools:
        print(f"  - {t.get('name')}: {t.get('description', '')[:90]}")
    journal.record_risk_event(
        "mcp_discovery", json.dumps([t.get("name") for t in tools])
    )

    required = {"get_accounts", "get_portfolio", "get_equity_positions",
                "review_equity_order", "place_equity_order"}
    missing_tools = required - {t.get("name") for t in tools}
    if missing_tools:
        kill_switch.engage(f"Robinhood MCP missing tools: {missing_tools}")
        journal.record_risk_event("mcp_tools_missing", str(missing_tools))
        print(f"Robinhood no longer exposes {missing_tools}. Halting.")
        return 1

    return _run_live_cycle(cfg, journal, kill_switch, broker)


def _run_live_cycle(cfg: Config, journal: TradeJournal,
                    kill_switch: KillSwitch, broker) -> int:
    """One daily LIVE_APPROVED cycle against the real Robinhood account.

    Same pipeline as paper, with three live-specific rules:
    - equity comes from Robinhood and an unverifiable balance halts trading;
    - every order (entry AND exit) needs the word APPROVE typed at the
      prompt — there is no auto-execution path;
    - only equities trade live (Robinhood's agentic MCP has no crypto
      order tools); crypto signals are journaled and reported only.
    """
    from data_sources import sentiment_data, prediction_market_data
    from execution import order_manager
    from execution.robinhood_mcp_broker import BrokerDisabled, OrderError
    from reports import daily_report
    from risk import correlation, regime_filter
    from risk.drawdown_guard import DrawdownGuard
    from risk.position_sizing import PositionSizeError
    from strategies import prediction_market_signal, signal_aggregator, trend_following

    # --- account + balance (unverifiable balance = no trading, by rule) ---
    try:
        acct = broker.get_account_number()
    except OrderError as e:
        kill_switch.engage(f"Cannot resolve agentic account: {e}")
        journal.record_risk_event("account_resolution_failed", str(e))
        print(f"Account resolution failed: {e}")
        return 1
    print(f"Agentic account: ****{acct[-4:]}")

    equity = broker.get_balance()
    if equity is None or equity <= 0:
        kill_switch.engage("Robinhood balance could not be verified")
        journal.record_risk_event("balance_unverifiable", f"got {equity}")
        print("Balance unverifiable — kill switch engaged, nothing trades.")
        return 1
    buying_power = broker.get_buying_power() or 0.0
    print(f"Account value: ${equity:,.2f}  Buying power: ${buying_power:,.2f}")
    journal.record_equity(equity, cfg.mode.value)

    # --- drawdown check against journaled live equity history ---
    history = journal.db.equity_history(cfg.mode.value)
    guard = DrawdownGuard(
        max_daily_pct=cfg.risk.max_daily_drawdown_pct,
        max_total_pct=cfg.risk.max_total_drawdown_pct,
        max_monthly_pct=cfg.risk.max_monthly_loss_pct,
        starting_equity=history[0][1] if history else equity,
    )
    for ts_str, eq in history:
        for b in guard.update(eq, datetime.fromisoformat(ts_str).date()):
            kill_switch.engage(str(b))
            journal.record_risk_event("drawdown_breach", str(b))

    # --- market data (stale/missing data = asset not traded, by rule) ---
    data = fetch_all_data(cfg, check_fresh=True)
    missed: list[str] = []
    for asset in cfg.watchlist.all_assets:
        if asset not in data:
            missed.append(f"{asset}: no fresh data — not traded (by rule)")
    prices = {a: float(df["close"].iloc[-1]) for a, df in data.items()}

    # --- reconcile live positions with managed state ---
    state_path = BASE_DIR / LIVE_STATE_FILE
    state = (json.loads(state_path.read_text())
             if state_path.exists() else {"positions": {}})
    try:
        held = broker.get_live_positions()
    except OrderError as e:
        kill_switch.engage(f"Cannot read live positions: {e}")
        journal.record_risk_event("positions_unreadable", str(e))
        return 1
    for sym in list(state["positions"]):
        if sym not in held:
            logger.info(f"{sym} no longer held — removing from managed state.")
            del state["positions"][sym]
    unmanaged = [s for s in held if s not in state["positions"]]
    for s in unmanaged:
        missed.append(f"{s}: held in account but not opened by JerryQuant — "
                      f"left alone (no stop is being managed for it)")

    tf = cfg.strategy.trend_following

    def _approved(prompt: str) -> bool:
        print(prompt)
        print("Type APPROVE to proceed. Anything else declines.")
        try:
            return input("Decision: ").strip() == "APPROVE"
        except (EOFError, KeyboardInterrupt):
            return False

    # --- manage exits: trailing stop / target / trend / time / scale-out,
    #     each needing explicit APPROVE ---
    open_positions: list[Position] = []
    for sym, st in list(state["positions"].items()):
        qty = held[sym]["quantity"]        # total held — for management/size
        sellable = held[sym]["sellable"]   # settled — the most we can sell now
        price = prices.get(sym)
        if price is None:
            missed.append(f"{sym}: no fresh price — exit checks skipped today")
            open_positions.append(Position(
                asset=sym, direction=Direction.LONG, size=qty,
                entry_price=st["entry_price"], stop=st["stop"],
                target=st["target"],
                opened_at=datetime.fromisoformat(st["opened_at"]),
                strategy=st.get("strategy", "trend_following"),
                dollar_risk=st.get("dollar_risk", 0.0)))
            continue

        ind = trend_following.compute_indicators(data[sym], cfg) if sym in data else None

        # Ratchet the trailing stop and persist it.
        if ind is not None and tf.use_trailing_stop:
            new_stop = trend_following.compute_trailing_stop(ind, cfg, st["stop"])
            if new_stop > st["stop"]:
                st["stop"] = new_stop
                state_path.write_text(json.dumps(state, indent=2))

        pos = Position(
            asset=sym, direction=Direction.LONG, size=qty,
            entry_price=st["entry_price"], stop=st["stop"], target=st["target"],
            opened_at=datetime.fromisoformat(st["opened_at"]),
            strategy=st.get("strategy", "trend_following"),
            dollar_risk=st.get("dollar_risk", 0.0),
        )
        days_held = max(0, (datetime.now(timezone.utc)
                            - pos.opened_at).days)

        # Decide on a FULL exit first (priority order).
        reason = None
        if pos.stop is not None and price <= pos.stop:
            reason = f"stop/trailing-stop hit (price {price:.2f} <= {pos.stop:.2f})"
        elif not tf.use_trailing_stop and pos.target and price >= pos.target:
            reason = f"target reached (price {price:.2f} >= {pos.target:.2f})"
        elif (tr := trend_following.time_stop_reason(
                days_held, pos.entry_price, price, cfg)):
            reason = tr
        elif ind is not None and (xr := trend_following.should_exit(ind, cfg)):
            reason = xr

        if reason:
            # Can only sell settled shares; an unsettled remainder (e.g. a
            # position opened yesterday) clears on a later cycle.
            if sellable <= 0:
                journal.record_risk_event("live_exit_unsettled", f"{sym}: {reason}")
                missed.append(f"{sym}: exit signaled ({reason}) but 0 shares "
                              f"are settled/sellable today — will retry")
                open_positions.append(pos)
                continue
            partial = sellable < qty * 0.999
            label = "PARTIAL (rest unsettled)" if partial else "ALL"
            if not _approved(
                f"\nEXIT — sell {label} {sellable:.6f}/{qty:.6f} {sym} "
                f"@ ~${price:,.2f}: {reason}"
            ):
                journal.record_risk_event("live_exit_rejected", f"{sym}: {reason}")
                missed.append(f"{sym}: exit signaled ({reason}) but not approved")
                open_positions.append(pos)
                continue
            try:
                result = broker.sell_position(sym, sellable, manually_approved=True)
                journal.record_risk_event("live_exit", json.dumps(
                    {"symbol": sym, "reason": reason, "sold": sellable,
                     "result": result}, default=str)[:2000])
                logger.info(f"LIVE exit: sold {sellable:.6f} {sym} — {reason}")
                if partial:
                    # Keep managing the unsettled remainder until it clears.
                    st["size"] = qty - sellable
                    state_path.write_text(json.dumps(state, indent=2))
                    missed.append(f"{sym}: sold settled {sellable:.6f}; "
                                  f"{qty - sellable:.6f} unsettled remains")
                    open_positions.append(pos)
                else:
                    del state["positions"][sym]
                    state_path.write_text(json.dumps(state, indent=2))
            except (BrokerDisabled, OrderError) as e:
                journal.record_risk_event("live_exit_failed", f"{sym}: {e}")
                missed.append(f"{sym}: exit approved but order failed — {e}")
                open_positions.append(pos)
            continue

        # No full exit — consider a partial profit-take (scale-out).
        units = trend_following.scale_out_units(
            pos.entry_price, qty, pos.dollar_risk, price, cfg,
            st.get("scaled_out", False),
        )
        units = min(units, sellable)   # never try to sell unsettled shares
        if units > 0:
            if not _approved(
                f"\nSCALE-OUT — sell {units:.6f} of {qty:.6f} {sym} "
                f"@ ~${price:,.2f} (partial profit at {tf.scale_out_r}R)"
            ):
                journal.record_risk_event("live_scale_rejected", f"{sym}")
                missed.append(f"{sym}: scale-out signaled but not approved")
                open_positions.append(pos)
                continue
            try:
                result = broker.sell_position(sym, units, manually_approved=True)
                journal.record_risk_event("live_scale_out", json.dumps(
                    {"symbol": sym, "units": units, "result": result},
                    default=str)[:2000])
                st["scaled_out"] = True
                st["size"] = qty - units
                if tf.breakeven_after_scale:
                    st["stop"] = max(st["stop"], pos.entry_price)
                    pos.stop = st["stop"]
                state_path.write_text(json.dumps(state, indent=2))
                logger.info(f"LIVE scale-out: sold {units:.6f} {sym}")
            except (BrokerDisabled, OrderError) as e:
                journal.record_risk_event("live_scale_failed", f"{sym}: {e}")
                missed.append(f"{sym}: scale-out approved but failed — {e}")
            open_positions.append(pos)
            continue

        open_positions.append(pos)

    # --- generate signals (same pipeline as paper/backtest) ---
    signals = []
    for asset, df in data.items():
        ind = trend_following.compute_indicators(df, cfg)
        sig = trend_following.evaluate(ind, asset, cfg)
        if sig is None:
            continue
        sentiment = sentiment_data.fetch_sentiment(asset)
        s_adj = sentiment_data.confidence_adjustment(
            sentiment, cfg.signals.sentiment_max_confidence_adjust
        )
        pm_view = prediction_market_signal.assess(
            asset, prediction_market_data.fetch_probabilities(asset), cfg
        )
        sig = signal_aggregator.apply_confidence_adjustments(
            sig, s_adj, pm_view.confidence_adjust, cfg
        )
        journal.record_signal(sig)
        signals.append(sig)

    actionable = signal_aggregator.filter_actionable(signals, cfg)
    logger.info(f"{len(signals)} signals evaluated, {len(actionable)} actionable.")

    # --- regime gate: no new longs in a bear/chop tape ---
    regime = regime_filter.assess_regime(data, cfg)
    logger.info(regime.render())
    journal.record_risk_event(
        "regime", f"risk_on={regime.risk_on}; {regime.render()}"
    )
    if not regime.risk_on and actionable:
        for sig in actionable:
            missed.append(f"{sig.asset}: signal valid but regime risk-off "
                          f"({'; '.join(regime.reasons)})")
        actionable = []

    closes = {a: df["close"] for a, df in data.items()}
    equities = {a.upper() for a in cfg.watchlist.equities}
    for sig in actionable:
        if sig.asset.upper().replace("-USD", "") not in equities:
            missed.append(f"{sig.asset}: signal valid but crypto cannot trade "
                          f"live (Robinhood agentic MCP has no crypto orders)")
            continue
        if not kill_switch.can_trade():
            missed.append(f"{sig.asset}: signal valid but kill switch engaged")
            continue
        try:
            ticket, size = order_manager.build_ticket(
                sig, equity, open_positions, prices, cfg
            )
        except order_manager.TradeBlocked as e:
            missed.append(f"{sig.asset}: blocked — {e}")
            continue
        except PositionSizeError as e:
            kill_switch.engage(f"Position sizing failed for {sig.asset}: {e}")
            journal.record_risk_event("position_sizing_failure", str(e))
            break

        # Correlation haircut + cluster cap on top of the standard gates.
        mult, note = correlation.correlation_haircut(
            sig.asset, open_positions, closes, cfg
        )
        if mult < 1.0:
            size.units *= mult
            size.value_usd *= mult
            size.dollar_risk *= mult
            logger.info(f"{sig.asset}: {note}")
        cluster_viol = correlation.check_cluster_exposure(
            sig.asset, size.value_usd, equity, open_positions, prices, cfg
        )
        if cluster_viol:
            missed.append(f"{sig.asset}: blocked — {'; '.join(cluster_viol)}")
            continue

        def execute(t, _sig=sig, _size=size):
            result = broker.place_order(_sig, _size.units, manually_approved=True)
            journal.record_risk_event(
                "live_entry", json.dumps({"symbol": _sig.asset,
                                          "units": _size.units,
                                          "result": result}, default=str)[:2000])
            opened_at = datetime.now(timezone.utc)
            state["positions"][_sig.asset.upper()] = {
                "entry_price": _sig.entry, "stop": _sig.stop,
                "target": _sig.target, "size": _size.units,
                "opened_at": opened_at.isoformat(),
                "strategy": _sig.strategy, "dollar_risk": _size.dollar_risk,
            }
            state_path.write_text(json.dumps(state, indent=2))
            # Reflect the new position in the same-day report.
            open_positions.append(Position(
                asset=_sig.asset.upper(), direction=Direction.LONG,
                size=_size.units, entry_price=_sig.entry, stop=_sig.stop,
                target=_sig.target, opened_at=opened_at,
                strategy=_sig.strategy, dollar_risk=_size.dollar_risk))
            logger.info(f"LIVE fill submitted: {_sig.asset} {_size.units:.6f}")

        try:
            outcome = order_manager.handle_live_signal(
                ticket, cfg, kill_switch, execute_fn=execute
            )
        except (BrokerDisabled, OrderError) as e:
            outcome = f"order failed — {e}"
            journal.record_risk_event("live_entry_failed", f"{sig.asset}: {e}")
            missed.append(f"{sig.asset}: approved but order failed — {e}")
        logger.info(f"{sig.asset}: {outcome}")

    # --- daily report ---
    equity_after = broker.get_balance() or equity
    peak = max([eq for _, eq in history] + [equity_after]) if history else equity_after
    dd = max(0.0, (peak - equity_after) / peak * 100.0) if peak > 0 else 0.0
    report = daily_report.build_report(
        daily_report.DailyReportData(
            portfolio_value=equity_after,
            cash=buying_power,
            open_positions=open_positions,
            position_prices=prices,
            drawdown_pct=dd,
            kill_switch_engaged=not kill_switch.can_trade(),
            kill_switch_reasons=kill_switch.reasons,
            missed_trades=missed,
        ),
        journal,
        cfg,
    )
    daily_report.deliver_report(report, cfg, BASE_DIR)
    return 0


def _arm_live_broker(cfg: Config, journal: TradeJournal, kill_switch: KillSwitch):
    """Arm the live broker and confirm Robinhood still exposes the tools we
    place orders against. Returns the broker, or None on any blocker."""
    from execution.robinhood_mcp_broker import BrokerDisabled, RobinhoodMCPBroker

    broker = RobinhoodMCPBroker(cfg, kill_switch)
    try:
        broker.assert_armed()
    except BrokerDisabled as e:
        print(f"Refusing to run live: {e}")
        return None
    try:
        tools = {t.get("name") for t in broker.discover()}
    except Exception as e:
        kill_switch.engage(f"Robinhood MCP connection failed: {e}")
        journal.record_risk_event("mcp_connection_failed", str(e))
        print(f"MCP connection failed ({e}).")
        return None
    required = {"get_accounts", "get_portfolio", "get_equity_positions",
                "review_equity_order", "place_equity_order"}
    if required - tools:
        kill_switch.engage(f"Robinhood MCP missing tools: {required - tools}")
        journal.record_risk_event("mcp_tools_missing", str(required - tools))
        print(f"Robinhood no longer exposes {required - tools}. Halting.")
        return None
    return broker


def _decide_live_actions(cfg: Config, journal: TradeJournal,
                         kill_switch: KillSwitch, broker):
    """Compute — WITHOUT executing — exactly what JerryQuant would do this
    cycle: trailing-stop ratchets, exits, scale-outs, and one-or-more entries,
    each already through every risk gate. Returns (actions, summary_lines).

    This is the single source of truth the propose step serializes and the
    execute step then applies, so you execute exactly what you approved."""
    from data_sources import sentiment_data, prediction_market_data
    from execution import order_manager
    from risk import correlation, regime_filter
    from risk.drawdown_guard import DrawdownGuard
    from risk.position_sizing import PositionSizeError
    from strategies import prediction_market_signal, signal_aggregator, trend_following

    actions: list[dict] = []
    notes: list[str] = []

    acct = broker.get_account_number()
    equity = broker.get_balance()
    if equity is None or equity <= 0:
        kill_switch.engage("Robinhood balance could not be verified")
        journal.record_risk_event("balance_unverifiable", f"got {equity}")
        return [], [f"Balance unverifiable (got {equity}) — kill switch engaged."], 0.0
    journal.record_equity(equity, cfg.mode.value)

    history = journal.db.equity_history(cfg.mode.value)
    guard = DrawdownGuard(
        max_daily_pct=cfg.risk.max_daily_drawdown_pct,
        max_total_pct=cfg.risk.max_total_drawdown_pct,
        max_monthly_pct=cfg.risk.max_monthly_loss_pct,
        starting_equity=history[0][1] if history else equity,
    )
    for ts_str, eq in history:
        for b in guard.update(eq, datetime.fromisoformat(ts_str).date()):
            kill_switch.engage(str(b))
            journal.record_risk_event("drawdown_breach", str(b))

    data = fetch_all_data(cfg, check_fresh=True)
    prices = {a: float(df["close"].iloc[-1]) for a, df in data.items()}

    state_path = BASE_DIR / LIVE_STATE_FILE
    state = (json.loads(state_path.read_text())
             if state_path.exists() else {"positions": {}})
    held = broker.get_live_positions()
    for sym in list(state["positions"]):
        if sym not in held:
            del state["positions"][sym]
    tf = cfg.strategy.trend_following

    # --- exits / scale-outs on managed positions ---
    open_positions = []
    for sym, st in list(state["positions"].items()):
        qty = held[sym]["quantity"]
        sellable = held[sym]["sellable"]
        price = prices.get(sym)
        if price is None:
            notes.append(f"{sym}: no fresh price — exit checks skipped")
            continue
        ind = trend_following.compute_indicators(data[sym], cfg) if sym in data else None
        if ind is not None and tf.use_trailing_stop:
            new_stop = trend_following.compute_trailing_stop(ind, cfg, st["stop"])
            if new_stop > st["stop"]:
                st["stop"] = new_stop
        from database.models import Direction, Position
        pos = Position(asset=sym, direction=Direction.LONG, size=qty,
                       entry_price=st["entry_price"], stop=st["stop"],
                       target=st["target"],
                       opened_at=datetime.fromisoformat(st["opened_at"]),
                       strategy=st.get("strategy", "trend_following"),
                       dollar_risk=st.get("dollar_risk", 0.0))
        open_positions.append(pos)
        days_held = max(0, (datetime.now(timezone.utc) - pos.opened_at).days)
        reason = None
        if pos.stop is not None and price <= pos.stop:
            reason = f"stop/trailing-stop hit ({price:.2f} <= {pos.stop:.2f})"
        elif not tf.use_trailing_stop and pos.target and price >= pos.target:
            reason = f"target reached ({price:.2f} >= {pos.target:.2f})"
        elif (tr := trend_following.time_stop_reason(days_held, pos.entry_price, price, cfg)):
            reason = tr
        elif ind is not None and (xr := trend_following.should_exit(ind, cfg)):
            reason = xr
        if reason:
            if sellable <= 0:
                notes.append(f"{sym}: exit signaled ({reason}) but 0 settled — will retry")
                continue
            actions.append({"kind": "exit", "symbol": sym, "units": sellable,
                            "reference_price": price, "reason": reason,
                            "full": sellable >= qty * 0.999})
            continue
        units = trend_following.scale_out_units(
            pos.entry_price, qty, pos.dollar_risk, price, cfg,
            st.get("scaled_out", False))
        units = min(units, sellable)
        if units > 0:
            actions.append({"kind": "scale_out", "symbol": sym, "units": units,
                            "reference_price": price,
                            "reason": f"partial profit at {tf.scale_out_r}R"})

    state_path.write_text(json.dumps(state, indent=2))  # persist ratcheted stops

    # --- entries ---
    regime = regime_filter.assess_regime(data, cfg)
    journal.record_risk_event("regime", f"risk_on={regime.risk_on}; {regime.render()}")
    if not regime.risk_on:
        notes.append(f"Regime RISK-OFF — no new entries ({'; '.join(regime.reasons)})")
        return actions, notes, equity

    signals = []
    for asset, df in data.items():
        ind = trend_following.compute_indicators(df, cfg)
        sig = trend_following.evaluate(ind, asset, cfg)
        if sig is None:
            continue
        s_adj = sentiment_data.confidence_adjustment(
            sentiment_data.fetch_sentiment(asset),
            cfg.signals.sentiment_max_confidence_adjust)
        pm = prediction_market_signal.assess(
            asset, prediction_market_data.fetch_probabilities(asset), cfg)
        sig = signal_aggregator.apply_confidence_adjustments(sig, s_adj, pm.confidence_adjust, cfg)
        journal.record_signal(sig)
        signals.append(sig)
    actionable = signal_aggregator.filter_actionable(signals, cfg)

    closes = {a: df["close"] for a, df in data.items()}
    equities = {a.upper() for a in cfg.watchlist.equities}
    for sig in actionable:
        if sig.asset.upper().replace("-USD", "") not in equities:
            notes.append(f"{sig.asset}: valid but crypto can't trade live")
            continue
        if not kill_switch.can_trade():
            notes.append(f"{sig.asset}: valid but kill switch engaged")
            continue
        if sig.asset.upper() in state["positions"]:
            continue
        try:
            ticket, size = order_manager.build_ticket(sig, equity, open_positions, prices, cfg)
        except order_manager.TradeBlocked as e:
            notes.append(f"{sig.asset}: blocked — {e}")
            continue
        except PositionSizeError as e:
            kill_switch.engage(f"Position sizing failed for {sig.asset}: {e}")
            journal.record_risk_event("position_sizing_failure", str(e))
            break
        mult, note = correlation.correlation_haircut(sig.asset, open_positions, closes, cfg)
        if mult < 1.0:
            size.units *= mult; size.value_usd *= mult; size.dollar_risk *= mult
        if correlation.check_cluster_exposure(sig.asset, size.value_usd, equity,
                                              open_positions, prices, cfg):
            notes.append(f"{sig.asset}: blocked — cluster cap")
            continue
        actions.append({"kind": "entry", "symbol": sig.asset.upper(),
                        "units": size.units, "entry": sig.entry, "stop": sig.stop,
                        "target": sig.target, "dollar_risk": size.dollar_risk,
                        "confidence": sig.confidence, "strategy": sig.strategy,
                        "reason": "; ".join(sig.reasons_for)[:300],
                        "ticket": ticket.render()})
    return actions, notes, equity


def _render_pending_md(actions, notes, equity, acct_last4) -> str:
    lines = ["# JerryQuant — proposed live actions", "",
             f"Account ****{acct_last4} · equity ${equity:,.2f} · "
             f"generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC}", ""]
    if not actions:
        lines += ["**No actions proposed — JerryQuant recommends doing nothing.**", ""]
    for i, a in enumerate(actions, 1):
        if a["kind"] == "entry":
            lines += [f"## {i}. BUY {a['symbol']} — {a['units']:.6f} units",
                      f"- Entry ~${a['entry']:,.2f} · stop ${a['stop']:,.2f} · "
                      f"target ${a['target']:,.2f}",
                      f"- Max loss ${a['dollar_risk']:,.2f} · confidence {a['confidence']}/100",
                      f"- {a['reason']}", ""]
        elif a["kind"] == "exit":
            lines += [f"## {i}. SELL {a['symbol']} — {a['units']:.6f} units (exit)",
                      f"- {a['reason']} · ~${a['reference_price']:,.2f}", ""]
        else:
            lines += [f"## {i}. SCALE-OUT {a['symbol']} — {a['units']:.6f} units",
                      f"- {a['reason']} · ~${a['reference_price']:,.2f}", ""]
    if notes:
        lines += ["---", "### Not traded", *[f"- {n}" for n in notes]]
    return "\n".join(lines)


def _proposal_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _proposal_fingerprint(action: dict, day: str | None = None) -> str:
    """Stable per-day id for a live action.

    The scan can run every 15 minutes; this prevents the same SPY buy or
    IBIT exit from asking for approval again unless the action materially
    changes or the calendar day rolls.
    """
    day = day or _proposal_day()
    kind = str(action.get("kind", "")).lower()
    symbol = str(action.get("symbol", "")).upper()
    strategy = str(action.get("strategy", ""))
    if kind == "entry":
        price_bucket = round(float(action.get("entry", 0.0)), 2)
        stop_bucket = round(float(action.get("stop", 0.0)), 2)
        raw = f"{day}|{kind}|{symbol}|{strategy}|{price_bucket}|{stop_bucket}"
    else:
        reason = str(action.get("reason", ""))[:80]
        raw = f"{day}|{kind}|{symbol}|{reason}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _filter_new_live_proposals(journal: TradeJournal, actions: list[dict],
                               source: str) -> tuple[list[dict], list[str]]:
    fresh: list[dict] = []
    skipped: list[str] = []
    now = datetime.now(timezone.utc)
    for action in actions:
        fp = _proposal_fingerprint(action)
        action["fingerprint"] = fp
        existing = journal.db.proposal_by_fingerprint(fp)
        if existing and existing["status"] in LIVE_PROPOSAL_STATUSES_SUPPRESS:
            skipped.append(
                f"{action['symbol']}: {action['kind']} already proposed "
                f"today ({existing['status']})"
            )
            continue
        journal.db.insert_live_proposal(
            fingerprint=fp,
            timestamp=now,
            source=source,
            symbol=action["symbol"],
            kind=action["kind"],
            action=action,
            detail=str(action.get("reason", ""))[:500],
        )
        fresh.append(action)
    return fresh, skipped


def run_live_propose(cfg: Config, journal: TradeJournal,
                     kill_switch: KillSwitch, source: str = "propose") -> int:
    """Read-only: compute the exact live actions and serialize them for an
    out-of-band approval (e.g. a GitHub environment gate). Places nothing."""
    broker = _arm_live_broker(cfg, journal, kill_switch)
    if broker is None:
        return 1
    acct = broker.get_account_number()
    actions, notes, equity = _decide_live_actions(cfg, journal, kill_switch, broker)
    actions, dedupe_notes = _filter_new_live_proposals(journal, actions, source)
    notes.extend(dedupe_notes)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "account_last4": acct[-4:],
        "equity": equity,
        "source": source,
        "actions": actions,
    }
    (BASE_DIR / LIVE_PENDING_FILE).write_text(json.dumps(payload, indent=2))
    md = _render_pending_md(actions, notes, equity, acct[-4:])
    (BASE_DIR / LIVE_PENDING_MD).write_text(md)
    print(md)
    if actions:
        from reports.daily_report import send_markdown_email
        send_markdown_email(
            md,
            cfg,
            subject=(
                f"JerryQuant Live {source.replace('_', ' ').title()} — "
                f"{len(actions)} pending action(s)"
            ),
        )
    print(f"\n{len(actions)} action(s) proposed → {LIVE_PENDING_FILE} "
          f"(nothing placed).")
    return 0


def run_live_execute(cfg: Config, journal: TradeJournal,
                     kill_switch: KillSwitch) -> int:
    """Apply EXACTLY the actions serialized by a prior propose run. Intended
    to run only after an authenticated human approval (the GitHub environment
    gate). Re-checks the kill switch and re-prices via the broker's own
    deviation guard at execution time."""
    from execution.robinhood_mcp_broker import BrokerDisabled, OrderError
    from database.models import Direction, Signal, SignalType

    pending_path = BASE_DIR / LIVE_PENDING_FILE
    if not pending_path.exists():
        print("No live_pending.json — nothing to execute.")
        return 0
    payload = json.loads(pending_path.read_text())
    gen = datetime.fromisoformat(payload["generated_at"])
    age_h = (datetime.now(timezone.utc) - gen).total_seconds() / 3600
    if age_h > LIVE_PENDING_MAX_AGE_H:
        journal.record_risk_event("live_pending_stale", f"{age_h:.1f}h old")
        for action in payload.get("actions", []):
            if action.get("fingerprint"):
                journal.db.update_live_proposal_status(
                    action["fingerprint"], "expired", f"{age_h:.1f}h old"
                )
        print(f"Proposal is {age_h:.1f}h old (> {LIVE_PENDING_MAX_AGE_H}h) — "
              f"refusing to execute stale tickets. Re-run propose.")
        pending_path.unlink()
        return 1

    broker = _arm_live_broker(cfg, journal, kill_switch)
    if broker is None:
        return 1

    state_path = BASE_DIR / LIVE_STATE_FILE
    state = (json.loads(state_path.read_text())
             if state_path.exists() else {"positions": {}})
    tf = cfg.strategy.trend_following
    done, failed = 0, 0
    for a in payload["actions"]:
        sym = a["symbol"]
        try:
            if a["kind"] == "entry":
                sig = Signal(asset=sym, signal_type=SignalType.ENTRY,
                             direction=Direction.LONG, entry=a["entry"],
                             stop=a["stop"], target=a["target"],
                             confidence=a["confidence"], strategy=a["strategy"])
                result = broker.place_order(sig, a["units"], manually_approved=True)
                state["positions"][sym] = {
                    "entry_price": a["entry"], "stop": a["stop"],
                    "target": a["target"], "size": a["units"],
                    "opened_at": datetime.now(timezone.utc).isoformat(),
                    "strategy": a["strategy"], "dollar_risk": a["dollar_risk"]}
                journal.record_risk_event("live_entry", json.dumps(
                    {"symbol": sym, "units": a["units"], "result": result}, default=str)[:2000])
            elif a["kind"] == "exit":
                result = broker.sell_position(sym, a["units"], manually_approved=True)
                journal.record_risk_event("live_exit", json.dumps(
                    {"symbol": sym, "reason": a.get("reason"), "result": result}, default=str)[:2000])
                if a.get("full", True):
                    state["positions"].pop(sym, None)
                elif sym in state["positions"]:
                    state["positions"][sym]["size"] = (
                        state["positions"][sym].get("size", a["units"]) - a["units"])
            else:  # scale_out
                result = broker.sell_position(sym, a["units"], manually_approved=True)
                if sym in state["positions"]:
                    st = state["positions"][sym]
                    st["scaled_out"] = True
                    if tf.breakeven_after_scale:
                        st["stop"] = max(st["stop"], st["entry_price"])
                journal.record_risk_event("live_scale_out", json.dumps(
                    {"symbol": sym, "units": a["units"], "result": result}, default=str)[:2000])
            state_path.write_text(json.dumps(state, indent=2))
            if a.get("fingerprint"):
                journal.db.update_live_proposal_status(a["fingerprint"], "executed")
            print(f"Executed {a['kind']} {sym} ({a['units']:.6f}).")
            done += 1
        except (BrokerDisabled, OrderError) as e:
            failed += 1
            if a.get("fingerprint"):
                journal.db.update_live_proposal_status(a["fingerprint"], "failed", str(e))
            journal.record_risk_event(f"live_{a['kind']}_failed", f"{sym}: {e}")
            print(f"FAILED {a['kind']} {sym}: {e}")
    pending_path.unlink()  # consume the proposal so it can't be replayed
    print(f"\nExecuted {done} action(s), {failed} failed. Proposal consumed.")
    return 0 if failed == 0 else 1


def run_validation(cfg: Config, journal: TradeJournal) -> int:
    """Validation rigor: walk-forward, parameter sensitivity, Monte Carlo.

    Pure analysis on historical data — never trades. Run this to decide
    whether the edge is robust before trusting it with money."""
    from backtesting import validation
    from backtesting.backtest_engine import run_backtest

    logger.info("Fetching historical data for validation...")
    data = fetch_all_data(cfg, check_fresh=False)
    if not data:
        logger.error("No usable data for any watchlist asset. Aborting.")
        return 1

    start = cfg.backtest.start_date
    end = cfg.backtest.end_date
    for asset in list(data):
        df = data[asset]
        df = df[df.index >= start]
        if end:
            df = df[df.index <= end]
        data[asset] = df

    print("\n" + "=" * 62)
    print("VALIDATION — is the edge real, or curve-fit?")
    print("=" * 62)

    # 1) Walk-forward out-of-sample windows
    try:
        wf = validation.walk_forward(data, cfg, n_windows=4)
        print("\n" + wf.render())
        journal.record_risk_event(
            "validation_walk_forward",
            f"profitable_windows_pct={wf.consistency_pct:.0f}",
        )
    except ValueError as e:
        print(f"\nWalk-forward skipped: {e}")

    # 2) Parameter sensitivity (curve-fit surface)
    grid = {
        "fast_ma": [20, 50, 80],
        "slow_ma": [150, 200],
        "atr_stop_multiple": [1.5, 2.0, 3.0],
    }
    pts = validation.parameter_sensitivity(data, cfg, grid)
    print("\n" + validation.render_sensitivity(pts))

    # 3) Monte Carlo on the realized trade sequence
    full = run_backtest(data, cfg)
    mc = validation.monte_carlo(
        [t.pnl for t in full.trades],
        cfg.account.starting_equity_usd,
        cfg,
    )
    if mc is None:
        print("\nMonte Carlo skipped: fewer than 5 trades in the base backtest.")
    else:
        print("\n" + mc.render())
        journal.record_risk_event(
            "validation_monte_carlo",
            f"p95_max_dd={mc.p95_max_dd_pct:.1f};prob_loss={mc.prob_loss_pct:.1f}",
        )
    print("\n" + "=" * 62)
    return 0


def main() -> int:
    # JERRYQUANT_ENV_PATH lets a self-hosted runner keep .env (and the
    # Robinhood token) outside the checked-out workspace, so `git clean`
    # during checkout can't delete it. Falls back to the local .env.
    load_dotenv(os.environ.get("JERRYQUANT_ENV_PATH") or (BASE_DIR / ".env"))
    parser = argparse.ArgumentParser(description="JerryQuant trading assistant")
    parser.add_argument("--config", default=str(BASE_DIR / "config.yaml"))
    parser.add_argument(
        "--mode",
        choices=["backtest", "paper", "live_review", "live_approved",
                 "live_plan", "live_scan", "live_propose", "live_execute"],
        default=None,
        help="Override mode from config.yaml. live_plan/live_scan/live_propose "
             "compute and serialize fresh tickets without placing anything; "
             "live_execute places exactly the proposed tickets (intended to "
             "run only after an authenticated approval gate).",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Run validation (walk-forward, parameter sensitivity, Monte "
             "Carlo) on historical data and exit. Never trades.",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    # propose/execute are sub-flows of live: arm the broker (mode LIVE_APPROVED)
    # but dispatch to the split propose/execute runners rather than the prompt.
    live_sub = args.mode if args.mode in (
        "live_plan", "live_scan", "live_propose", "live_execute"
    ) else None
    if live_sub:
        cfg = cfg.model_copy(update={"mode": Mode.LIVE_APPROVED})
    elif args.mode:
        cfg = cfg.model_copy(update={"mode": Mode(args.mode.upper())})
    setup_logging(cfg)
    logger.info(f"JerryQuant starting in {cfg.mode.value} mode")

    kill_switch = KillSwitch(BASE_DIR / cfg.execution.halt_file)
    if not kill_switch.can_trade() and cfg.mode != Mode.BACKTEST:
        logger.error(
            f"{cfg.execution.halt_file} exists — trading is halted. "
            "Only BACKTEST mode runs while halted."
        )
        return 1

    db = Database(BASE_DIR / cfg.database.path)
    journal = TradeJournal(db)
    try:
        if args.validate:
            return run_validation(cfg, journal)
        if live_sub in ("live_plan", "live_scan", "live_propose"):
            return run_live_propose(cfg, journal, kill_switch, source=live_sub)
        if live_sub == "live_execute":
            return run_live_execute(cfg, journal, kill_switch)
        if cfg.mode == Mode.BACKTEST:
            return run_backtest_mode(cfg, journal)
        if cfg.mode == Mode.PAPER:
            return run_signal_cycle(cfg, journal, kill_switch, execute=True)
        if cfg.mode == Mode.LIVE_REVIEW:
            return run_signal_cycle(cfg, journal, kill_switch, execute=False)
        if cfg.mode == Mode.LIVE_APPROVED:
            return run_live_approved_mode(cfg, journal, kill_switch)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
