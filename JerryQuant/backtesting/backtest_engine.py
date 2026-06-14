"""Event-driven daily-bar backtest engine.

Walks history one bar at a time with no lookahead: signals are computed
on data up to and including day T and filled at day T+1's open, with
slippage, spread, and fees applied. The same risk modules used in paper
and live modes (position sizing, exposure limits, drawdown guard) gate
every simulated trade, so the backtest exercises the real safety code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from backtesting.performance_metrics import PerformanceReport, compute_metrics
from core.config import Config
from database.models import Direction, Position, SignalType, Trade
from risk import correlation, regime_filter
from risk.drawdown_guard import DrawdownGuard
from risk.exposure_limits import check_exposure
from risk.position_sizing import PositionSizeError, calculate_position_size
from strategies import trend_following


@dataclass
class BacktestResult:
    report: PerformanceReport
    trades: list[Trade]
    equity_curve: pd.Series
    halted: bool
    halt_reason: Optional[str]
    skipped_signals: int = 0
    regime_blocked: int = 0


@dataclass
class _OpenPosition:
    position: Position
    entry_fees: float = 0.0
    scaled_out: bool = False
    bars_held: int = 0


def _apply_entry_costs(price: float, cfg: Config) -> float:
    b = cfg.backtest
    return price * (1 + (b.slippage_pct + b.spread_pct / 2) / 100.0)


def _apply_exit_costs(price: float, cfg: Config) -> float:
    b = cfg.backtest
    return price * (1 - (b.slippage_pct + b.spread_pct / 2) / 100.0)


def run_backtest(data: dict[str, pd.DataFrame], cfg: Config) -> BacktestResult:
    """data maps asset -> daily OHLCV dataframe (columns open/high/low/close/volume).

    All dataframes are aligned on their common date index.
    """
    p = cfg.strategy.trend_following
    indicators = {
        asset: trend_following.compute_indicators(df, cfg)
        for asset, df in data.items()
    }
    common_index = None
    for df in indicators.values():
        common_index = df.index if common_index is None else common_index.union(df.index)
    common_index = common_index.sort_values()

    equity = cfg.account.starting_equity_usd
    cash = equity
    guard = DrawdownGuard(
        max_daily_pct=cfg.risk.max_daily_drawdown_pct,
        max_total_pct=cfg.risk.max_total_drawdown_pct,
        max_monthly_pct=cfg.risk.max_monthly_loss_pct,
        starting_equity=equity,
    )
    crypto_assets = {a.upper() for a in cfg.watchlist.crypto}

    open_pos: dict[str, _OpenPosition] = {}
    closed: list[Trade] = []
    equity_points: list[tuple[pd.Timestamp, float]] = []
    halted = False
    halt_reason: Optional[str] = None
    daily_halt_day = None
    skipped = 0
    regime_blocked = 0
    fee_rate = cfg.backtest.fee_pct / 100.0

    warmup = p.slow_ma + 1

    def mark_prices(ts) -> dict[str, float]:
        prices = {}
        for asset, df in indicators.items():
            if ts in df.index:
                prices[asset] = float(df.loc[ts, "close"])
        return prices

    def _record(asset, pos, units, fill, ts, reason, entry_fee_part, exit_fee):
        pnl = (fill - pos.entry_price) * units - entry_fee_part - exit_fee
        closed.append(
            Trade(
                asset=asset,
                direction=pos.direction,
                size=units,
                entry_price=pos.entry_price,
                exit_price=fill,
                stop=pos.stop,
                target=pos.target,
                dollar_risk=pos.dollar_risk,
                confidence=0,
                strategy=pos.strategy,
                data_sources=[cfg.data.provider],
                reasoning=reason,
                opened_at=pos.opened_at,
                closed_at=ts.to_pydatetime().replace(tzinfo=timezone.utc),
                exit_reason=reason,
                fees=entry_fee_part + exit_fee,
                pnl=pnl,
            )
        )

    def close_position(asset: str, fill: float, ts: pd.Timestamp, reason: str) -> None:
        nonlocal cash
        op = open_pos.pop(asset)
        pos = op.position
        exit_fee = fill * pos.size * fee_rate
        cash += fill * pos.size - exit_fee
        _record(asset, pos, pos.size, fill, ts, reason, op.entry_fees, exit_fee)

    def scale_out(asset: str, units: float, fill: float, ts: pd.Timestamp) -> None:
        """Sell part of a winner, bank the profit, ratchet stop to breakeven."""
        nonlocal cash
        op = open_pos[asset]
        pos = op.position
        units = min(units, pos.size)
        frac = units / pos.size if pos.size else 0.0
        exit_fee = fill * units * fee_rate
        cash += fill * units - exit_fee
        entry_fee_part = op.entry_fees * frac
        _record(asset, pos, units, fill, ts,
                "Scale-out: partial profit", entry_fee_part, exit_fee)
        pos.size -= units
        pos.dollar_risk *= (1 - frac)
        op.entry_fees *= (1 - frac)
        op.scaled_out = True
        if cfg.strategy.trend_following.breakeven_after_scale:
            pos.stop = max(pos.stop, pos.entry_price)

    for i, ts in enumerate(common_index):
        # --- 1) manage exits on today's bar (stop first: pessimistic) ---
        tf = cfg.strategy.trend_following
        for asset in list(open_pos.keys()):
            df = indicators[asset]
            if ts not in df.index:
                continue
            bar = df.loc[ts]
            op = open_pos[asset]
            op.bars_held += 1
            pos = op.position

            # Ratchet the trailing stop using data through YESTERDAY only —
            # the stop in force today must be knowable at today's open.
            if tf.use_trailing_stop:
                prior = df.loc[:ts].iloc[:-1]
                pos.stop = trend_following.compute_trailing_stop(prior, cfg, pos.stop)

            # Stop (incl. ratcheted trailing stop) — pessimistic intrabar fill.
            if bar["low"] <= pos.stop:
                fill = _apply_exit_costs(min(pos.stop, float(bar["open"])), cfg)
                close_position(asset, fill, ts, "Stop/trailing-stop hit")
                continue

            # Fixed take-profit only when NOT trailing; trailing lets winners run.
            if not tf.use_trailing_stop and bar["high"] >= pos.target:
                close_position(asset, _apply_exit_costs(pos.target, cfg), ts,
                               "Take profit hit")
                continue

            close = float(bar["close"])
            # Partial profit-take at the configured R multiple.
            units = trend_following.scale_out_units(
                pos.entry_price, pos.size, pos.dollar_risk, close, cfg,
                op.scaled_out,
            )
            if units > 0:
                scale_out(asset, units, _apply_exit_costs(close, cfg), ts)
                if open_pos.get(asset) is None or pos.size <= 0:
                    continue

            # Time stop: dead capital is a cost.
            tr = trend_following.time_stop_reason(
                op.bars_held, pos.entry_price, close, cfg
            )
            if tr:
                close_position(asset, _apply_exit_costs(close, cfg), ts, tr)
                continue

            # Trend break / extreme volatility.
            exit_reason = trend_following.should_exit(df.loc[:ts], cfg)
            if exit_reason:
                close_position(asset, _apply_exit_costs(close, cfg), ts, exit_reason)

        # --- 2) mark equity and run drawdown guard ---
        prices = mark_prices(ts)
        equity = cash + sum(
            op.position.value(prices.get(a, op.position.entry_price))
            for a, op in open_pos.items()
        )
        equity_points.append((ts, equity))
        today = ts.date()
        breaches = guard.update(equity, today)
        for b in breaches:
            if b.kind == "total":
                if not halted:
                    halted = True
                    halt_reason = str(b)
                    # Liquidate everything at today's close; system is done.
                    for asset in list(open_pos.keys()):
                        price = prices.get(asset, open_pos[asset].position.entry_price)
                        close_position(
                            asset, _apply_exit_costs(price, cfg), ts,
                            f"Kill switch: {b}",
                        )
            elif b.kind in ("daily", "monthly"):
                daily_halt_day = today

        if halted:
            continue

        # --- 3) evaluate entries; fill at next bar's open ---
        if daily_halt_day == today:
            continue
        if i + 1 >= len(common_index):
            continue
        next_ts = common_index[i + 1]

        # Regime gate: no new longs in a bear/chop tape. Built from data
        # through today only (the slices end at ts), so there is no lookahead.
        data_upto = {
            a: idf.loc[:ts] for a, idf in indicators.items() if ts in idf.index
        }
        regime = regime_filter.assess_regime(data_upto, cfg)
        if not regime.risk_on:
            regime_blocked += 1
            continue
        closes_upto = {a: d["close"] for a, d in data_upto.items()}

        for asset, df in indicators.items():
            if asset in open_pos or ts not in df.index or next_ts not in df.index:
                continue
            upto = df.loc[:ts]
            if len(upto) < warmup:
                continue
            sig = trend_following.evaluate(
                upto, asset, cfg,
                timestamp=ts.to_pydatetime().replace(tzinfo=timezone.utc),
            )
            if sig is None or sig.signal_type != SignalType.ENTRY:
                continue

            fill = _apply_entry_costs(float(df.loc[next_ts, "open"]), cfg)
            # Re-anchor stop/target to the actual fill, keeping R multiples.
            risk_per_unit = sig.entry - sig.stop
            stop = fill - risk_per_unit
            target = fill + cfg.risk.min_risk_reward * risk_per_unit
            if stop <= 0 or risk_per_unit <= 0:
                skipped += 1
                continue

            try:
                size = calculate_position_size(
                    equity=equity,
                    entry=fill,
                    stop=stop,
                    max_risk_pct=cfg.risk.max_risk_per_trade_pct,
                    max_position_pct=cfg.risk.max_single_asset_pct,
                )
            except PositionSizeError:
                skipped += 1
                continue

            open_positions = [op.position for op in open_pos.values()]

            # Correlation haircut: shrink a position that doubles up on risk
            # already in the book (e.g. a third correlated crypto name).
            mult, _ = correlation.correlation_haircut(
                asset, open_positions, closes_upto, cfg
            )
            if mult < 1.0:
                size.units *= mult
                size.value_usd *= mult
                size.dollar_risk *= mult

            violations = check_exposure(
                candidate_asset=asset,
                candidate_value_usd=size.value_usd,
                candidate_is_crypto=asset.upper() in crypto_assets,
                equity=equity,
                open_positions=open_positions,
                position_prices=prices,
                max_open_positions=cfg.risk.max_open_positions,
                max_single_asset_pct=cfg.risk.max_single_asset_pct,
                max_crypto_pct=cfg.risk.max_crypto_allocation_pct,
                crypto_assets=crypto_assets,
            )
            violations += correlation.check_cluster_exposure(
                candidate_asset=asset,
                candidate_value_usd=size.value_usd,
                equity=equity,
                open_positions=open_positions,
                position_prices=prices,
                cfg=cfg,
            )
            if violations:
                skipped += 1
                continue

            cost = size.units * fill
            entry_fee = cost * fee_rate
            if cost + entry_fee > cash:
                # Never spend money we don't have; shrink to available cash.
                affordable = cash / (fill * (1 + fee_rate))
                if affordable <= 0:
                    skipped += 1
                    continue
                size.units = affordable
                cost = size.units * fill
                entry_fee = cost * fee_rate
            cash -= cost + entry_fee
            open_pos[asset] = _OpenPosition(
                position=Position(
                    asset=asset,
                    direction=Direction.LONG,
                    size=size.units,
                    entry_price=fill,
                    stop=stop,
                    target=target,
                    opened_at=next_ts.to_pydatetime().replace(tzinfo=timezone.utc),
                    strategy=sig.strategy,
                    dollar_risk=size.units * risk_per_unit,
                ),
                entry_fees=entry_fee,
            )

    # Close anything still open at the final bar for accounting purposes.
    if open_pos:
        final_ts = common_index[-1]
        prices = mark_prices(final_ts)
        for asset in list(open_pos.keys()):
            price = prices.get(asset, open_pos[asset].position.entry_price)
            close_position(
                asset, _apply_exit_costs(price, cfg), final_ts, "End of backtest"
            )

    equity_curve = pd.Series(
        [e for _, e in equity_points],
        index=[t for t, _ in equity_points],
        dtype=float,
    )

    buy_hold = _buy_and_hold_return(data, warmup)
    report = compute_metrics(closed, equity_curve, buy_hold)
    return BacktestResult(
        report=report,
        trades=closed,
        equity_curve=equity_curve,
        halted=halted,
        halt_reason=halt_reason,
        skipped_signals=skipped,
        regime_blocked=regime_blocked,
    )


def _buy_and_hold_return(data: dict[str, pd.DataFrame], warmup: int) -> Optional[float]:
    """Equal-weight buy-and-hold over the same post-warmup window."""
    rets = []
    for df in data.values():
        if len(df) <= warmup:
            continue
        start = float(df["close"].iloc[warmup])
        end = float(df["close"].iloc[-1])
        if start > 0:
            rets.append(end / start - 1)
    if not rets:
        return None
    return sum(rets) / len(rets) * 100.0
