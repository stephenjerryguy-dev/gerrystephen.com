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
import json
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

    # --- manage existing positions ---
    if execute:
        for t in broker.check_stops_and_targets(prices):
            journal.record_trade(t, mode="PAPER")
            logger.info(f"Closed {t.asset}: {t.exit_reason}, P&L ${t.pnl:+.2f}")
        for asset in list(broker.positions.keys()):
            if asset not in data:
                continue
            ind = trend_following.compute_indicators(data[asset], cfg)
            reason = trend_following.should_exit(ind, cfg)
            if reason:
                t = broker.close_long(asset, prices[asset], reason)
                journal.record_trade(t, mode="PAPER")
                logger.info(f"Closed {asset}: {reason}, P&L ${t.pnl:+.2f}")

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
    print(
        "\nDiscovery complete and journaled. Order placement gets wired to "
        "these tools next; until then no live order can be sent."
    )
    return 0


def main() -> int:
    load_dotenv(BASE_DIR / ".env")
    parser = argparse.ArgumentParser(description="JerryQuant trading assistant")
    parser.add_argument("--config", default=str(BASE_DIR / "config.yaml"))
    parser.add_argument(
        "--mode",
        choices=["backtest", "paper", "live_review", "live_approved"],
        default=None,
        help="Override mode from config.yaml",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    if args.mode:
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
