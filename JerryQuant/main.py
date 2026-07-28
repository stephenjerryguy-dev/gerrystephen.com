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
# Statuses that mean a human (or a fill) has already acted on the proposal, so
# it must never be re-proposed or rewritten. 'proposed' is deliberately NOT
# here: an untouched proposal is re-priced and carried forward by each later
# run, so the plan nearest the open is the one holding live prices.
LIVE_PROPOSAL_STATUSES_SUPPRESS = {"approved", "executed", "rejected"}


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


def _load_live_state(journal: TradeJournal) -> dict:
    """Managed-position state. Lives in Postgres when a durable ledger is
    configured (so ephemeral hosted runs keep managing stops); otherwise a
    local JSON file."""
    db = getattr(journal, "db", None)
    if db is not None and getattr(db, "uses_postgres", False):
        return db.get_live_state()
    p = BASE_DIR / LIVE_STATE_FILE
    return json.loads(p.read_text()) if p.exists() else {"positions": {}}


def _save_live_state(journal: TradeJournal, state: dict) -> None:
    db = getattr(journal, "db", None)
    if db is not None and getattr(db, "uses_postgres", False):
        db.save_live_state(state)
        return
    (BASE_DIR / LIVE_STATE_FILE).write_text(json.dumps(state, indent=2))


def _is_transient_connection_error(exc: Exception) -> bool:
    """True for network-layer failures that a later run can simply retry.

    Deliberately narrow: DNS/socket/timeout/connection faults only. An auth
    failure or a missing-tool mismatch is NOT transient — those mean the
    integration is genuinely wrong and should still halt.
    """
    import socket
    if isinstance(exc, (socket.gaierror, socket.timeout, ConnectionError, TimeoutError)):
        return True
    text = str(exc).lower()
    markers = (
        "nodename nor servname",     # macOS DNS failure
        "name or service not known",  # linux DNS failure
        "temporary failure in name resolution",
        "connection reset", "connection refused", "connection aborted",
        "timed out", "read timeout", "connect timeout",
        "network is unreachable", "no route to host",
        "server disconnected", "remote end closed",
    )
    return any(m in text for m in markers)


def _arm_live_broker(cfg: Config, journal: TradeJournal, kill_switch: KillSwitch):
    """Arm the live broker and confirm Robinhood still exposes the tools we
    place orders against. Returns the broker, or None on any blocker."""
    from execution.robinhood_mcp_broker import BrokerDisabled, RobinhoodMCPBroker

    # Pass the DB as a durable token store so a rotated refresh token survives
    # ephemeral hosted runs (a GitHub secret can't be written back at runtime).
    broker = RobinhoodMCPBroker(cfg, kill_switch, token_store=journal.db)
    try:
        broker.assert_armed()
    except BrokerDisabled as e:
        print(f"Refusing to run live: {e}")
        return None
    try:
        tools = {t.get("name") for t in broker.discover()}
    except Exception as e:
        # A TRANSIENT network failure must not engage the kill switch. The
        # switch is persistent by design and clearing it is manual, so a DNS
        # blip used to silently stop all trading until someone noticed — it
        # cost 9 days from 2026-07-13, then happened again on 2026-07-27.
        # Aborting this run gives identical protection (no orders are placed
        # before discovery succeeds) without the sticky flag; the next
        # scheduled scan simply retries. Genuine risk conditions — an
        # unverifiable balance, a breached limit — still engage it.
        if _is_transient_connection_error(e):
            journal.record_risk_event("mcp_connection_transient", str(e))
            print(f"MCP connection failed ({e}) — transient, not halting. "
                  f"The next scheduled run will retry.")
            return None
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

    state = _load_live_state(journal)
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

    _save_live_state(journal, state)  # persist ratcheted stops

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
            lines.append(f"## {i}. BUY {a['symbol']} — {a['units']:.6f} units")
            if a.get("stop") is not None:   # stop-managed entry (trend, copy sleeve)
                # A target is optional: copied trades carry a stop but no
                # auditable price target, so never assume both are present.
                risk_line = f"- Entry ~${a['entry']:,.2f} · stop ${a['stop']:,.2f}"
                if a.get("target") is not None:
                    risk_line += f" · target ${a['target']:,.2f}"
                else:
                    risk_line += " · no fixed target"
                lines += [
                    risk_line,
                    f"- Max loss ${a['dollar_risk']:,.2f} · confidence {a['confidence']}/100",
                ]
            else:                           # rotation/allocation — always-invested, no fixed stop
                strat = a.get("strategy", "strategy")
                how = ("diversified rebalance" if strat == "allocation"
                       else "momentum rotation")
                lines.append(f"- Entry ~${a['entry']:,.2f} · {how} "
                             f"(managed by strategy, not a fixed stop)")
            lines += [f"- {a['reason']}", ""]
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
    if strategy in ("rotation", "allocation", "paste_copy"):
        # Rotation/allocation prices drift intraday; dedup on symbol+kind+day
        # so the same rebalance trade doesn't re-ask approval every scan.
        raw = f"{day}|{kind}|{symbol}|{strategy}"
    elif kind == "entry":
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
        if existing and existing["status"] == "proposed":
            # Still awaiting a human decision. Do NOT drop it: each run must
            # emit the complete, currently-executable set, so the proposal
            # closest to the open is the one that carries live prices. Re-price
            # in place and carry it forward, flagged so it is not re-notified.
            action["renewed"] = True
            journal.db.refresh_live_proposal(
                fp, now, action, str(action.get("reason", ""))[:500])
            fresh.append(action)
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


def _decide_rotation_actions(cfg: Config, journal: TradeJournal,
                             kill_switch: KillSwitch, broker):
    """Always-invested momentum rotation, live. Hold the strongest of the pool;
    rotate to it when it changes; step to the defensive asset when the whole
    pool is below cash. Returns (actions, notes, equity).

    Sizing is rotation-appropriate: deploy up to max_allocation_pct of equity
    into the leader (not the trend system's stop-based 20% sizing). A switch
    sells this cycle and buys next cycle, since sale proceeds settle T+1."""
    from data_sources import market_data
    from execution.robinhood_mcp_broker import OrderError
    from strategies import momentum_rotation

    rc = cfg.strategy.rotation
    notes: list[str] = []

    equity = broker.get_balance()
    if equity is None or equity <= 0:
        kill_switch.engage("Robinhood balance could not be verified")
        journal.record_risk_event("balance_unverifiable", f"got {equity}")
        return [], [f"Balance unverifiable (got {equity})."], 0.0
    buying_power = broker.get_buying_power() or 0.0
    journal.record_equity(equity, cfg.mode.value)

    # Ring-fence the copy sleeve's budget. Rotation deploys up to
    # max_allocation_pct (95%) of equity into one asset, which consumed every
    # dollar of buying power and left the paste.trade sleeve permanently
    # unable to place anything — the sleeve would look configured and simply
    # never fire. Reserving it here is what makes the two coexist.
    copy_reserve = 0.0
    if os.environ.get("JERRYQUANT_RH_COPY_BUDGET_USD", "").strip():
        try:
            copy_reserve = max(0.0, float(
                os.environ["JERRYQUANT_RH_COPY_BUDGET_USD"]))
        except ValueError:
            copy_reserve = 0.0
    if copy_reserve > 0:
        usable = max(0.0, buying_power - copy_reserve)
        if usable < buying_power:
            notes.append(
                f"reserving ${min(copy_reserve, buying_power):,.2f} of buying "
                f"power for the paste.trade copy sleeve")
        buying_power = usable

    if not kill_switch.can_trade():
        return [], ["Kill switch engaged — no rotation."], equity

    # Fresh data for the pool + defensive asset (stale = don't act, by rule).
    symbols = list(dict.fromkeys(rc.rotation_assets + [rc.defensive_asset]))
    closes, prices = {}, {}
    for s in symbols:
        try:
            df = market_data.fetch_daily(s, history_days=cfg.data.history_days)
            market_data.check_freshness(df, cfg.data.max_staleness_hours_equity, s)
            closes[s] = df["close"]
            prices[s] = float(df["close"].iloc[-1])
        except market_data.DataUnavailableError as e:
            notes.append(f"{s}: {e}")

    # The incumbent is the largest rotation-pool position actually held, so
    # hysteresis is measured against what we own rather than nothing.
    held = broker.get_live_positions()
    pool = set(rc.rotation_assets) | {rc.defensive_asset}
    incumbent = None
    if held:
        pool_held = {s: v for s, v in held.items()
                     if s in pool and float(v.get("quantity", 0)) > 0}
        if pool_held:
            incumbent = max(
                pool_held,
                key=lambda s: float(pool_held[s]["quantity"]) * prices.get(s, 0.0))

    decision = momentum_rotation.decide_target(closes, cfg, incumbent=incumbent)

    # CADENCE. The backtest only ever rotates on scheduled rebalance dates, so
    # a live path that re-evaluates on every scan was never the strategy that
    # was validated — it rotated 5 days after the previous rotation, and even
    # bought and sold QQQ 14 minutes apart on 2026-07-27. Defensive moves are
    # exempt: stepping to cash when the pool breaks down is risk reduction and
    # should never wait for a calendar date.
    if incumbent and decision.target != incumbent and decision.risk_on:
        last_rot = (_load_live_state(journal) or {}).get("last_rotation_at")
        min_days = 28 if rc.rebalance == "monthly" else 7
        if last_rot:
            try:
                since = (datetime.now(timezone.utc)
                         - datetime.fromisoformat(last_rot)).days
            except ValueError:
                since = min_days
            if since < min_days:
                notes.append(
                    f"holding {incumbent}: last rotation was {since}d ago, "
                    f"{rc.rebalance} cadence needs {min_days}d — "
                    f"{decision.target} deferred")
                decision = momentum_rotation.RotationDecision(
                    target=incumbent, risk_on=True, ranking=decision.ranking,
                    reasons=[f"{rc.rebalance} cadence: holding {incumbent}"])
    journal.record_risk_event("rotation_decision", decision.render())
    notes.append(decision.render())
    target = decision.target
    if target not in prices:
        return [], notes + [f"No fresh price for target {target} — standing pat."], equity

    try:
        held = broker.get_live_positions()
    except OrderError as e:
        kill_switch.engage(f"Cannot read live positions: {e}")
        return [], [f"positions unreadable: {e}"], equity

    # Price anything we HOLD but that isn't in the rotation pool (e.g. a
    # leftover diversified basket). Without this those tickets render "~$0.00",
    # which is misleading on a ticket you're being asked to approve.
    for sym in held:
        if sym in prices:
            continue
        try:
            df = market_data.fetch_daily(sym, history_days=cfg.data.history_days)
            prices[sym] = float(df["close"].iloc[-1])
        except market_data.DataUnavailableError:
            notes.append(f"{sym}: held but no fresh price — shown without a reference")

    actions: list[dict] = []
    selling = False
    # Positions opened today, from our own managed state. Selling one of these
    # is a same-day round trip: in a cash account that is the Good Faith
    # Violation pattern (three in 12 months = 90 days settled-cash-only), and
    # it happened for real on 2026-07-27 when a top-up filled at the open and
    # the whole position was sold 14 minutes later.
    opened_today = set()
    if rc.block_same_day_roundtrip:
        today = datetime.now(timezone.utc).date().isoformat()
        for psym, pstate in (_load_live_state(journal) or {}).get("positions", {}).items():
            if str(pstate.get("opened_at", ""))[:10] == today:
                opened_today.add(psym)

    for sym, pos in held.items():
        if sym == target:
            continue
        if sym in opened_today:
            notes.append(f"{sym}: opened today — not selling same-day "
                         f"(Good Faith Violation guard)")
            continue
        if pos["sellable"] > 0:
            actions.append({"kind": "exit", "symbol": sym, "units": pos["sellable"],
                            "reference_price": prices.get(sym, 0.0),
                            "reason": f"rotate out of {sym} -> {target}",
                            "full": pos["sellable"] >= pos["quantity"] * 0.999,
                            "strategy": "rotation"})
            selling = True
        else:
            notes.append(f"{sym}: 0 settled shares — will rotate out next cycle")

    already_holding_target = (
        target in held and held[target]["quantity"] > 0
    )
    if already_holding_target:
        # Holding the leader is NOT the same as being fully invested in it.
        # After rotating out of other names the proceeds land as cash, so a
        # bare "no change" here would strand that cash permanently — every
        # later cycle would repeat it. Top the position up toward the target
        # weight using whatever is actually settled and spendable now; the
        # rest follows on the next cycle as T+1 proceeds settle.
        price = prices.get(target, 0.0)
        desired = equity * rc.max_allocation_pct / 100.0
        current_value = held[target]["quantity"] * price
        shortfall = desired - current_value
        alloc = min(shortfall, buying_power)
        if price <= 0:
            notes.append(f"holding {target} but no fresh price — no top-up")
        elif shortfall <= 0:
            notes.append(f"already holding {target} at target weight — no change")
        elif alloc < 1.0:
            notes.append(
                f"holding {target}, ${shortfall:,.2f} under target weight but only "
                f"${buying_power:,.2f} settled — will top up as cash settles")
        else:
            actions.append({"kind": "entry", "symbol": target,
                            "units": alloc / price, "entry": price,
                            "stop": None, "target": None, "dollar_risk": 0.0,
                            "confidence": 100, "strategy": "rotation",
                            "reason": f"top up {target} toward target weight",
                            "ticket": f"BUY {target} ~{alloc / price:.6f} @ "
                                      f"${price:,.2f} (~${alloc:,.2f}) — top up "
                                      f"toward {rc.max_allocation_pct:.0f}% target weight"})
    elif selling:
        # Proceeds settle T+1; buy the new leader next cycle with settled cash.
        notes.append(f"selling first; will buy {target} next cycle after settlement")
    else:
        alloc = min(equity * rc.max_allocation_pct / 100.0, buying_power)
        price = prices[target]
        units = alloc / price if price > 0 else 0.0
        if alloc < 1.0 or units <= 0:
            notes.append(f"insufficient buying power (${buying_power:.2f}) to buy {target}")
        else:
            actions.append({"kind": "entry", "symbol": target, "units": units,
                            "entry": price, "stop": None, "target": None,
                            "dollar_risk": 0.0, "confidence": 100,
                            "strategy": "rotation",
                            "reason": decision.reasons[0],
                            "ticket": f"BUY {target} ~{units:.6f} @ ${price:,.2f} "
                                      f"(~${alloc:,.2f}, {rc.max_allocation_pct:.0f}% of equity) "
                                      f"— {decision.reasons[0]}"})
    return actions, notes, equity


def _decide_allocation_actions(cfg: Config, journal: TradeJournal,
                               kill_switch: KillSwitch, broker):
    """Diversified target-allocation, live. Rebalance toward target weights
    when holdings drift past the band; do nothing when within band. Sells
    settle T+1, so a rebalance sells this cycle and buys with available
    buying power (remaining buys complete next cycle). Returns (actions,
    notes, equity)."""
    from data_sources import market_data
    from execution.robinhood_mcp_broker import OrderError
    from strategies import allocation

    ac = cfg.strategy.allocation
    notes: list[str] = []

    equity = broker.get_balance()
    if equity is None or equity <= 0:
        kill_switch.engage("Robinhood balance could not be verified")
        return [], [f"Balance unverifiable (got {equity})."], 0.0
    buying_power = broker.get_buying_power() or 0.0
    journal.record_equity(equity, cfg.mode.value)
    if not kill_switch.can_trade():
        return [], ["Kill switch engaged — no rebalance."], equity

    prices = {}
    for s in allocation.normalized_weights(cfg):
        try:
            df = market_data.fetch_daily(s, history_days=cfg.data.history_days)
            market_data.check_freshness(df, cfg.data.max_staleness_hours_equity, s)
            prices[s] = float(df["close"].iloc[-1])
        except market_data.DataUnavailableError as e:
            notes.append(f"{s}: {e}")
    if len(prices) < len(ac.weights):
        return [], notes + ["missing fresh prices for some targets — standing pat"], equity

    try:
        held = broker.get_live_positions()
    except OrderError as e:
        kill_switch.engage(f"Cannot read live positions: {e}")
        return [], [f"positions unreadable: {e}"], equity

    current_values = {s: held[s]["quantity"] * prices.get(s, 0.0)
                      for s in held if s in prices}

    # Visibility: current weight vs target for every asset, every run.
    invested = sum(current_values.values())
    targets = allocation.normalized_weights(cfg)
    notes.append(f"Portfolio ${equity:,.2f} (invested ${invested:,.2f}):")
    for s in targets:
        cur_pct = (current_values.get(s, 0.0) / equity * 100.0) if equity else 0.0
        notes.append(f"  {s}: {cur_pct:4.0f}% vs target {targets[s]*100:3.0f}%")

    plan = allocation.plan_rebalance(current_values, equity, cfg)
    notes.extend(plan.reasons)
    if not plan.needed:
        return [], notes, equity

    actions, buy_budget = [], buying_power
    # Sells first (free up cash; proceeds settle T+1).
    settlement_pending = False
    for t in plan.trades:
        if t.side != "sell":
            continue
        price = prices[t.symbol]
        sellable = held.get(t.symbol, {}).get("sellable", 0.0)
        units = min(t.dollars / price, sellable)
        if units * price >= ac.min_trade_usd and units > 0:
            qty = held[t.symbol]["quantity"]
            actions.append({"kind": "exit", "symbol": t.symbol, "units": units,
                            "reference_price": price,
                            "reason": f"rebalance trim {t.symbol}",
                            "full": units >= qty * 0.999, "strategy": "allocation"})
        elif sellable <= 0 and t.dollars >= ac.min_trade_usd:
            settlement_pending = True
            notes.append(f"{t.symbol}: needs trimming but isn't settled yet — "
                         f"will sell next cycle (T+1)")

    # Buys, scaled to available buying power. If the funding is mostly tied up
    # in not-yet-settled sells, defer the whole buy side rather than dribbling
    # dust trades — do the real rebalance once the cash settles.
    total_buy = sum(t.dollars for t in plan.trades if t.side == "buy")
    if settlement_pending and buy_budget < 0.5 * total_buy:
        notes.append(f"deferring buys (only ${buy_budget:,.2f} free vs "
                     f"${total_buy:,.2f} needed) until pending sells settle")
        return actions, notes, equity

    scale = min(1.0, buy_budget / total_buy) if total_buy > 0 else 0.0
    for t in plan.trades:
        if t.side != "buy":
            continue
        dollars = t.dollars * scale
        price = prices[t.symbol]
        units = dollars / price if price > 0 else 0.0
        if dollars >= ac.min_trade_usd and units > 0:
            actions.append({"kind": "entry", "symbol": t.symbol, "units": units,
                            "entry": price, "stop": None, "target": None,
                            "dollar_risk": 0.0, "confidence": 100,
                            "strategy": "allocation",
                            "reason": f"rebalance buy {t.symbol} to target weight",
                            "ticket": f"BUY {t.symbol} ~{units:.6f} @ ${price:,.2f} "
                                      f"(~${dollars:,.2f}) — diversified rebalance"})
    if total_buy > 0 and scale < 1.0 and not settlement_pending:
        notes.append(f"buying power ${buy_budget:,.2f} < needed ${total_buy:,.2f}; "
                     f"buying {scale*100:.0f}% now, rest after settlement")
    return actions, notes, equity


def _paste_sleeve_actions(cfg: Config, broker, equity: float, journal=None,
                          pending_exits=None):
    """Optional copy sleeve: paste.trade observations -> approvable tickets.

    Ring-fenced to its own budget and entirely optional — if the budget env
    vars are unset, or anything at all fails, the sleeve stays silent rather
    than disturbing the core strategy. Long-equity-at-Robinhood only, 1x, with
    tradability verified before anything is proposed."""
    from strategies import paste_bridge

    if not os.environ.get("JERRYQUANT_RH_COPY_BUDGET_USD", "").strip():
        return [], []          # sleeve not configured — stay quiet
    try:
        from data_sources.paste_trade import fetch_best_trades
        from strategies.paste_trade_router import build_live_tickets

        handles = [h.strip() for h in os.environ.get(
            "JERRYQUANT_PASTE_HANDLES", "notthreadguy").split(",") if h.strip()]
        trades = fetch_best_trades()
        routed = build_live_tickets(
            trades, handles,
            max_age_minutes=int(os.environ.get(
                "JERRYQUANT_PASTE_MAX_AGE_MINUTES") or "30"),
        )
        try:
            buying_power = broker.get_buying_power()
        except Exception:
            buying_power = None
        # NOTE: an earlier version added this run's expected sale proceeds to
        # buying power, on the theory that exits fill before entries. The live
        # account disproved it: after the 2026-07-22 open the five sells filled
        # and cash went 6.57 -> 80.19 while BUYING POWER STAYED AT 6.57.
        # Proceeds land as unsettled cash and are not spendable the same day,
        # so counting them would size orders against money that does not exist
        # and, where partially allowed, would buy with unsettled funds and risk
        # a Good Faith Violation. Settled buying power is the only honest input.
        if pending_exits:
            pass
        res = paste_bridge.build_actions(
            list(routed.tickets), broker, equity, buying_power=buying_power)
        actions, notes = list(res.actions), list(res.notes)

        # Manage copies we already hold: close the ones whose source thesis has
        # broken down, rather than leaving the 8% stop as the only exit.
        if journal is not None:
            managed = (_load_live_state(journal) or {}).get("positions", {})
            if any(p.get("strategy") == "paste_copy" for p in managed.values()):
                held = broker.get_live_positions()
                ex = paste_bridge.exit_actions(managed, held, trades)
                # Exits lead: never re-enter a name we are closing this cycle.
                closing = {a["symbol"] for a in ex.actions}
                actions = ex.actions + [a for a in actions
                                        if a["symbol"] not in closing]
                notes.extend(ex.notes)
        return actions, notes
    except Exception as e:
        return [], [f"paste.trade sleeve skipped ({type(e).__name__}: {str(e)[:80]})"]


def run_live_propose(cfg: Config, journal: TradeJournal,
                     kill_switch: KillSwitch, source: str = "propose") -> int:
    """Read-only: compute the exact live actions and serialize them for an
    out-of-band approval (e.g. a GitHub environment gate). Places nothing."""
    broker = _arm_live_broker(cfg, journal, kill_switch)
    if broker is None:
        return 1
    acct = broker.get_account_number()
    if cfg.strategy.active == "rotation":
        actions, notes, equity = _decide_rotation_actions(cfg, journal, kill_switch, broker)
    elif cfg.strategy.active == "allocation":
        actions, notes, equity = _decide_allocation_actions(cfg, journal, kill_switch, broker)
    else:
        actions, notes, equity = _decide_live_actions(cfg, journal, kill_switch, broker)

    # Additive copy sleeve (own budget; silent unless configured).
    paste_actions, paste_notes = _paste_sleeve_actions(
        cfg, broker, equity, journal, pending_exits=actions)
    actions = list(actions) + paste_actions
    notes.extend(paste_notes)

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
    renewed = sum(1 for a in actions if a.get("renewed"))
    if renewed:
        notes.append(f"{renewed} action(s) carried over from an earlier run and "
                     f"re-priced — figures above are current as of this run")
    md = _render_pending_md(actions, notes, equity, acct[-4:])
    (BASE_DIR / LIVE_PENDING_MD).write_text(md)
    print(md)
    # Re-priced carry-forwards are not news. Only alert when something is
    # genuinely new, otherwise every 15-minute scan would re-buzz the phone
    # for trades already sitting in the approval queue.
    newly_proposed = [a for a in actions if not a.get("renewed")]
    if actions and newly_proposed:
        from reports.daily_report import send_markdown_email
        from reports import notify
        send_markdown_email(
            md,
            cfg,
            subject=(
                f"JerryQuant Live {source.replace('_', ' ').title()} — "
                f"{len(actions)} pending action(s)"
            ),
        )
        # One-glance push to your phone: the ticket + a tap-through to approve.
        sent = notify.push_ticket(
            title=f"JerryQuant — approve {len(actions)} trade(s)",
            message=notify.summarize_actions(actions) + "\n\nTap to approve.",
        )
        if sent:
            print("Pushed approval notification to your phone.")
    print(f"\n{len(actions)} action(s) proposed → {LIVE_PENDING_FILE} "
          f"(nothing placed).")
    return 0


def run_shadow(cfg: Config, journal: TradeJournal, kill_switch: KillSwitch,
               starting_cash: float = 100.0) -> int:
    """Full autonomy against a simulated ledger — decides AND fills, no approval.

    This is the experiment that has to happen before autonomy is a real
    conversation: identical decision code, identical sleeves (including the
    paste.trade copy sleeve), zero human input, zero money. It answers 'what
    would a self-driving JerryQuant actually have done?' with a track record
    rather than an argument.

    The only live calls made here are READ-ONLY: prices, and a tradability
    lookup the simulation cannot honestly invent. Orders go to ShadowBroker,
    which has no venue to reach.
    """
    from data_sources import market_data
    from execution import shadow_broker as sb

    portfolio = sb.load_portfolio(journal.db, starting_cash)

    # 1) Settle anything decided on a previous run at TODAY's opening print.
    #    Done before deciding, so the new decision sees a truthful account.
    pending_symbols = sorted({o["symbol"] for o in portfolio.pending})
    opens: dict[str, float] = {}
    for symbol in pending_symbols:
        try:
            frame = market_data.fetch_daily(
                symbol, history_days=cfg.data.history_days)
            opens[symbol] = float(frame["open"].iloc[-1])
        except market_data.DataUnavailableError:
            continue

    reference = _arm_live_broker(cfg, journal, kill_switch)
    broker = sb.ShadowBroker(portfolio, reference_broker=reference)
    filled, fill_notes = broker.fill_pending(opens)
    for fill in filled:
        print(f"SHADOW FILL {fill.side.upper()} {fill.symbol} "
              f"{fill.units:.6f} @ ${fill.price:,.2f}")
    for note in fill_notes:
        print(f"  note: {note}")

    # 2) Decide, with the shadow account standing in for the real one.
    equity = portfolio.equity({s: p.get("last_price", p.get("avg_price", 0.0))
                               for s, p in portfolio.positions.items()})
    if cfg.strategy.active == "rotation":
        actions, notes, equity = _decide_rotation_actions(
            cfg, journal, kill_switch, broker)
    elif cfg.strategy.active == "allocation":
        actions, notes, equity = _decide_allocation_actions(
            cfg, journal, kill_switch, broker)
    else:
        actions, notes, equity = _decide_live_actions(
            cfg, journal, kill_switch, broker)

    paste_actions, paste_notes = _paste_sleeve_actions(
        cfg, broker, equity, journal, pending_exits=actions)
    actions = list(actions) + paste_actions
    notes.extend(paste_notes)

    # 3) Queue every decision. No approval gate — that is the entire point,
    #    and it is only safe because ShadowBroker cannot reach a venue.
    queued = 0
    for action in actions:
        try:
            if action["kind"] == "entry":
                signal = Signal(asset=action["symbol"], signal_type=SignalType.ENTRY,
                                direction=Direction.LONG, entry=action["entry"],
                                stop=action["stop"], target=action["target"],
                                confidence=action["confidence"],
                                strategy=action["strategy"])
                broker.place_order(signal, action["units"], manually_approved=True)
            else:
                broker.sell_position(action["symbol"], action["units"],
                                     manually_approved=True)
            queued += 1
        except Exception as e:      # a bad decision must not kill the run
            notes.append(f"{action['symbol']}: shadow queue failed ({e})")

    sb.save_portfolio(journal.db, portfolio)

    # 4) Report the standing of the experiment.
    marks = {s: p.get("last_price", p.get("avg_price", 0.0))
             for s, p in portfolio.positions.items()}
    now_equity = portfolio.equity(marks)
    start = portfolio.starting_equity or starting_cash
    print(f"\n--- SHADOW AUTONOMY (simulated; no money at risk) ---")
    print(f"Started {portfolio.started_at or 'now'} at ${start:,.2f}")
    print(f"Equity ${now_equity:,.2f} ({(now_equity / start - 1) * 100:+.2f}%) · "
          f"cash ${portfolio.cash:,.2f} · {len(portfolio.fills)} fill(s) to date")
    for symbol, position in sorted(portfolio.positions.items()):
        print(f"  {symbol:<6} {position['units']:.6f} @ avg "
              f"${position.get('avg_price', 0.0):,.2f}")
    print(f"{queued} order(s) queued for the next opening print.")
    for note in notes:
        print(f"  note: {note}")
    return 0


def run_weather_scan(station_key: str = "nyc") -> int:
    """Compare a calibrated ensemble against Kalshi's temperature book.

    MONITOR ONLY, deliberately. This does not feed the approval queue and is
    not wired into live_propose, because the edge it reports has not yet been
    forward-tested: three separate corrections (grid-vs-station bias, the
    ensemble/deterministic model mismatch, and temperature-dependent bias) each
    removed most of an apparent edge that turned out to be our own error. The
    remaining disagreement with a liquid book may be a fourth. Log it, watch it
    settle, and only then consider letting it propose anything.
    """
    import datetime as dt
    from zoneinfo import ZoneInfo

    from data_sources import kalshi, weather
    from strategies import weather_edge

    station = weather.STATIONS[station_key]
    try:
        settled = kalshi.fetch_settled_values(station.kalshi_series)
        official: dict[dt.date, float] = {}
        for key, value in settled.items():
            try:
                official[dt.datetime.strptime(key, "%y%b%d").date()] = value
            except ValueError:
                continue
        calibration = weather.calibrate(station, official)
        target = dt.datetime.now(ZoneInfo(station.timezone)).date()
        raw_members = weather.fetch_ensemble_members(station, target)
        point = weather.fetch_point_forecast(station, target)
        members = weather.calibrated_members(raw_members, point, calibration)
        markets = [
            m for m in kalshi.fetch_markets(series_ticker=station.kalshi_series,
                                            status="open", limit=100)
            if weather_edge.event_date(m, station.timezone) == target
        ]
    except (weather.WeatherUnavailableError, kalshi.KalshiUnavailableError) as e:
        print(f"Weather scan unavailable: {e}")
        return 1

    centre = sum(members) / len(members)
    print(f"\n{station.name} — high temp for {target}")
    print(f"Calibration: {calibration.describe()}")
    print(f"Model: point {point:.1f}°F, ensemble mean "
          f"{sum(raw_members) / len(raw_members):.1f}°F "
          f"({len(raw_members)} members) → calibrated centre {centre:.1f}°F\n")
    print(f"{'market':<28}{'model':>8}{'ask':>8}{'edge':>8}")
    total = 0.0
    for market in sorted(markets, key=lambda m: m.ticker):
        interval = weather_edge.strike_interval(market)
        if interval is None:
            continue
        probability = weather.probability_within(members, calibration, *interval)
        total += probability
        ask = market.yes_ask or 0.0
        print(f"{market.ticker:<28}{probability:>7.0%}{ask:>8.2f}"
              f"{probability - ask:>+8.0%}")
    # Probabilities over a complete partition must sum to ~1; a sum far from
    # 100% means the bins were misread, not that an edge was found.
    print(f"{'(sanity: sum over bins)':<28}{total:>7.0%}")

    edges, notes = weather_edge.find_edges(
        markets, members, calibration, min_edge=0.05)
    print(f"\n{len(edges)} market(s) above the edge threshold "
          f"— MONITOR ONLY, nothing proposed:")
    for edge in edges:
        print(f"  {edge.describe()}")
    for note in notes:
        print(f"  note: {note}")
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

    state = _load_live_state(journal)
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
                    "strategy": a["strategy"], "dollar_risk": a["dollar_risk"],
                    "source_trade_id": a.get("source_trade_id")}
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
            # Stamp the rotation clock so the cadence gate can enforce the
            # rebalance interval. Only a real rotation counts — a top-up of the
            # incumbent must not restart the clock.
            if a.get("strategy") == "rotation" and a["kind"] == "exit":
                state["last_rotation_at"] = datetime.now(timezone.utc).isoformat()
            _save_live_state(journal, state)
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


def run_rotation_backtest_mode(cfg: Config, journal: TradeJournal) -> int:
    """Backtest + walk-forward the always-invested momentum rotation strategy,
    and print what it would hold right now. Pure analysis — never trades."""
    from data_sources import market_data
    from backtesting import rotation_engine
    from strategies import momentum_rotation

    rc = cfg.strategy.rotation
    symbols = list(dict.fromkeys(rc.rotation_assets + [rc.defensive_asset]))
    logger.info(f"Fetching history for rotation pool: {symbols}")
    data = {}
    for s in symbols:
        try:
            data[s] = market_data.fetch_daily(s, history_days=3000)
        except market_data.DataUnavailableError as e:
            logger.warning(f"Skipping {s}: {e}")
    if rc.defensive_asset not in data or len(data) < 2:
        logger.error("Need the defensive asset and at least one rotation asset.")
        return 1

    print("\n" + "=" * 62)
    print(f"ROTATION BACKTEST — hold strongest of {rc.rotation_assets}, "
          f"cash={rc.defensive_asset}, {rc.lookback_days}d momentum")
    print(f"  stop-loss: {'on '+str(rc.stop_loss_pct)+'%' if rc.use_stop_loss else 'off'}"
          f"   take-profit: {'on '+str(rc.take_profit_pct)+'%' if rc.use_take_profit else 'off'}")
    print("=" * 62)
    result = rotation_engine.run_rotation_backtest(data, cfg)
    print(result.render())
    journal.record_risk_event("rotation_backtest",
                              f"cagr={result.cagr_pct:.1f};max_dd={result.max_drawdown_pct:.1f}")
    print("\n  Last 6 rotations:")
    for t in result.trades[-6:]:
        print(f"    {t[0]}  {t[1]} -> {t[2]}")

    print("\n--- Walk-forward (out-of-sample windows) ---")
    try:
        for w in rotation_engine.rotation_walk_forward(data, cfg, n_windows=4):
            b = f"(b&h {w['bench_cagr']:+}%)" if w["bench_cagr"] is not None else ""
            print(f"  {w['window']} {w['start']}..{w['end']}: "
                  f"CAGR {w['cagr']:+}%  MaxDD {w['max_dd']}%  {b}")
    except ValueError as e:
        print(f"  skipped: {e}")

    closes = {s: df["close"] for s, df in data.items()}
    decision = momentum_rotation.decide_target(closes, cfg)
    print("\n--- Right now it would hold ---")
    print(f"  {decision.render()}")
    print("=" * 62)
    return 0


def run_allocation_backtest_mode(cfg: Config, journal: TradeJournal) -> int:
    """Backtest the diversified target-allocation vs buy-&-hold SPY, and show
    today's target vs current drift. Pure analysis — never trades."""
    from data_sources import market_data
    from backtesting import allocation_engine
    from strategies import allocation

    weights = allocation.normalized_weights(cfg)
    logger.info(f"Fetching history for allocation: {list(weights)}")
    data = {}
    for s in weights:
        try:
            data[s] = market_data.fetch_daily(s, history_days=3000)
        except market_data.DataUnavailableError as e:
            logger.warning(f"Skipping {s}: {e}")

    print("\n" + "=" * 62)
    print("DIVERSIFIED ALLOCATION BACKTEST")
    print("  " + "  ".join(f"{s} {w*100:.0f}%" for s, w in weights.items()))
    print("=" * 62)
    try:
        r = allocation_engine.run_allocation_backtest(data, cfg)
    except ValueError as e:
        print(f"  cannot run: {e}")
        return 1
    print(r.render())
    journal.record_risk_event("allocation_backtest",
                              f"cagr={r.cagr_pct:.1f};max_dd={r.max_drawdown_pct:.1f}")
    print("=" * 62)
    return 0


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
                 "live_plan", "live_scan", "live_propose", "live_execute",
                 "shadow"],
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
    parser.add_argument(
        "--rotation-backtest",
        action="store_true",
        help="Backtest + walk-forward the momentum-rotation strategy and show "
             "today's pick. Never trades.",
    )
    parser.add_argument(
        "--allocation-backtest",
        action="store_true",
        help="Backtest the diversified target-allocation vs buy-&-hold. Never trades.",
    )
    parser.add_argument(
        "--weather-scan",
        action="store_true",
        help="Score Kalshi temperature markets against a calibrated ensemble. "
             "MONITOR ONLY — prints the comparison and never proposes a trade.",
    )
    parser.add_argument(
        "--paste-monitor",
        action="store_true",
        help="Read and normalize paste.trade's public feed. Monitoring only; "
             "never connects to a broker or wallet and never trades.",
    )
    parser.add_argument(
        "--paste-live-tickets",
        action="store_true",
        help="Build expiring, non-executing Robinhood/Hyperliquid review "
             "tickets for selected paste.trade sources.",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    if args.weather_scan:
        return run_weather_scan()

    if args.paste_monitor or args.paste_live_tickets:
        from data_sources.paste_trade import fetch_best_trades, render_report

        try:
            trades = fetch_best_trades()
            if args.paste_live_tickets:
                from strategies.paste_trade_router import (
                    build_live_tickets,
                    render_live_tickets,
                    ticket_fingerprint,
                )
                handle_csv = (
                    os.environ.get("JERRYQUANT_PASTE_HANDLES", "").strip()
                    or "notthreadguy"
                )
                handles = [h.strip() for h in handle_csv.split(",") if h.strip()]
                routed = build_live_tickets(
                    trades,
                    handles,
                    max_age_minutes=int(os.environ.get(
                        "JERRYQUANT_PASTE_MAX_AGE_MINUTES"
                    ) or "30"),
                    approval_window_minutes=int(os.environ.get(
                        "JERRYQUANT_APPROVAL_WINDOW_MINUTES"
                    ) or "10"),
                    hyperliquid_leverage_cap=int(os.environ.get(
                        "JERRYQUANT_HL_LEVERAGE_CAP"
                    ) or "2"),
                )
                rendered = render_live_tickets(routed)
                print(rendered)
                notify_tickets = list(routed.tickets)
                if routed.tickets:
                    # Reuse JerryQuant's durable proposal ledger so the same
                    # social post does not notify on every 15-minute poll.
                    ticket_db = Database(BASE_DIR / cfg.database.path)
                    try:
                        notify_tickets = []
                        for ticket in routed.tickets:
                            fingerprint = ticket_fingerprint(ticket)
                            if ticket_db.proposal_by_fingerprint(fingerprint):
                                continue
                            ticket_db.insert_live_proposal(
                                fingerprint=fingerprint,
                                timestamp=ticket.observed_at,
                                source="paste.trade",
                                symbol=ticket.symbol,
                                kind=f"{ticket.venue}_{ticket.direction.lower()}",
                                action={
                                    "trade_id": ticket.trade_id,
                                    "venue": ticket.venue,
                                    "symbol": ticket.symbol,
                                    "direction": ticket.direction,
                                    "source_url": ticket.source_url,
                                    "status": ticket.status,
                                    "expires_at": ticket.expires_at.isoformat(),
                                },
                                detail="; ".join(ticket.blockers)[:500],
                            )
                            notify_tickets.append(ticket)
                    finally:
                        ticket_db.close()
                if notify_tickets:
                    from reports import notify

                    notify.push_ticket(
                        title=f"JerryQuant — {len(notify_tickets)} fresh social ticket(s)",
                        message="\n".join(
                            f"{t.venue}: {t.direction} {t.symbol} "
                            f"({t.status}, expires {t.expires_at:%H:%M} UTC)"
                            for t in notify_tickets
                        ),
                    )
            else:
                print(render_report(trades))
            return 0
        except Exception as exc:
            print("# JerryQuant — paste.trade monitor")
            print()
            print(f"Feed unavailable: {exc}")
            return 1

    # propose/execute are sub-flows of live: arm the broker (mode LIVE_APPROVED)
    # but dispatch to the split propose/execute runners rather than the prompt.
    live_sub = args.mode if args.mode in (
        "live_plan", "live_scan", "live_propose", "live_execute", "shadow"
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
        if args.rotation_backtest:
            return run_rotation_backtest_mode(cfg, journal)
        if args.allocation_backtest:
            return run_allocation_backtest_mode(cfg, journal)
        if live_sub in ("live_plan", "live_scan", "live_propose"):
            return run_live_propose(cfg, journal, kill_switch, source=live_sub)
        if live_sub == "live_execute":
            return run_live_execute(cfg, journal, kill_switch)
        if live_sub == "shadow":
            return run_shadow(cfg, journal, kill_switch)
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
