"""Backtest for the always-invested momentum rotation strategy.

Monthly (or weekly) rebalance: hold the strongest asset in the pool, rotate
when another overtakes it, step to the defensive asset when the whole pool is
below cash. Optional intra-period stop-loss / take-profit (default off — they
mostly cost return; the cash filter is the real protector). Costs are charged
on every switch.

Kept separate from the per-asset trend-following engine because rotation is a
portfolio-level decision (rank the pool, hold one), not a per-asset signal.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from core.config import Config
from strategies import momentum_rotation


@dataclass
class RotationResult:
    total_return_pct: float
    cagr_pct: float
    max_drawdown_pct: float
    num_rotations: int
    final_equity: float
    equity_curve: pd.Series
    trades: list[tuple]  # (date, from, to, reason)
    benchmark_cagr_pct: Optional[float] = None
    benchmark_max_dd_pct: Optional[float] = None
    benchmark_symbol: Optional[str] = None

    def render(self) -> str:
        lines = [
            f"  Total return        {self.total_return_pct:+.0f}%",
            f"  CAGR                {self.cagr_pct:+.1f}%",
            f"  Max drawdown        {self.max_drawdown_pct:.1f}%",
            f"  Rotations           {self.num_rotations}",
            f"  Final equity        {self.final_equity:.3f}x",
        ]
        if self.benchmark_cagr_pct is not None:
            lines.append(
                f"  Buy & hold {self.benchmark_symbol:<7} CAGR {self.benchmark_cagr_pct:+.1f}%"
                f"  MaxDD {self.benchmark_max_dd_pct:.1f}%"
            )
        return "\n".join(lines)


def _rebalance_dates(index: pd.DatetimeIndex, cadence: str) -> set:
    period = "W" if cadence == "weekly" else "M"
    return set(index.to_series().groupby(index.to_period(period)).tail(1).index)


def run_rotation_backtest(
    data: dict[str, pd.DataFrame], cfg: Config, cost_pct: Optional[float] = None,
) -> RotationResult:
    """`data` maps symbol -> OHLCV df. Uses close prices. Needs the rotation
    pool plus the defensive asset present in `data`."""
    rc = cfg.strategy.rotation
    if cost_pct is None:
        b = cfg.backtest
        cost_pct = (b.slippage_pct + b.spread_pct / 2 + b.fee_pct) / 100.0

    closes = pd.concat(
        {s: df["close"] for s, df in data.items()}, axis=1
    ).dropna()
    if len(closes) <= rc.lookback_days + 5:
        raise ValueError("Not enough overlapping history for the rotation pool")

    index = closes.index
    rebal = _rebalance_dates(index, rc.rebalance)
    series = {s: closes[s] for s in closes.columns}

    eq = 1.0
    held = rc.defensive_asset
    entry = peak = None
    curve, dates, trades = [], [], []
    start = rc.lookback_days

    for i in range(start, len(index)):
        d = index[i]
        # Rebalance using info available at yesterday's close (no lookahead).
        if index[i - 1] in rebal or i == start:
            decision = momentum_rotation.decide_target(series, cfg, asof=i - 1)
            target = decision.target
            if target != held:
                eq *= (1 - cost_pct)
                trades.append((d.date(), held, target, decision.reasons[0]))
                held = target
                entry = float(closes[held].iloc[i - 1])
                peak = entry
        # Apply the day's return of whatever we hold.
        r = float(closes[held].iloc[i] / closes[held].iloc[i - 1] - 1.0)
        eq *= (1 + r)
        px = float(closes[held].iloc[i])
        # Optional intra-period exits to the defensive asset.
        if held != rc.defensive_asset and entry:
            peak = max(peak or px, px)
            hit = (
                (rc.use_stop_loss and px <= entry * (1 - rc.stop_loss_pct / 100.0))
                or (rc.use_take_profit and px >= entry * (1 + rc.take_profit_pct / 100.0))
            )
            if hit:
                eq *= (1 - cost_pct)
                trades.append((d.date(), held, rc.defensive_asset, "stop/target hit"))
                held = rc.defensive_asset
        curve.append(eq)
        dates.append(d)

    curve_s = pd.Series(curve, index=dates)
    years = (curve_s.index[-1] - curve_s.index[0]).days / 365.25
    cagr = (curve_s.iloc[-1] ** (1 / years) - 1) if years > 0 else 0.0
    dd = float(((curve_s - curve_s.cummax()) / curve_s.cummax()).min())

    bench = rc.rotation_assets[0] if rc.rotation_assets else None
    bcagr = bdd = None
    if bench in closes.columns:
        bser = closes[bench].loc[curve_s.index[0]:]
        bcagr = (float(bser.iloc[-1] / bser.iloc[0]) ** (1 / years) - 1) if years > 0 else 0.0
        bdd = float(((bser / bser.cummax()) - 1).min())

    return RotationResult(
        total_return_pct=(curve_s.iloc[-1] - 1) * 100.0,
        cagr_pct=cagr * 100.0,
        max_drawdown_pct=dd * 100.0,
        num_rotations=len(trades),
        final_equity=float(curve_s.iloc[-1]),
        equity_curve=curve_s,
        trades=trades,
        benchmark_cagr_pct=(bcagr * 100.0) if bcagr is not None else None,
        benchmark_max_dd_pct=(bdd * 100.0) if bdd is not None else None,
        benchmark_symbol=bench,
    )


def rotation_walk_forward(data: dict[str, pd.DataFrame], cfg: Config,
                          n_windows: int = 4) -> list[dict]:
    """Run the rotation backtest on sequential out-of-sample windows so we can
    see whether the edge is stable across periods, not just one lucky stretch.
    Each window carries the lookback as lead-in."""
    rc = cfg.strategy.rotation
    closes = pd.concat({s: df["close"] for s, df in data.items()}, axis=1).dropna()
    index = closes.index
    warmup = rc.lookback_days + 5
    if len(index) < warmup + n_windows * 20:
        raise ValueError("Not enough history for rotation walk-forward")
    bounds = np.linspace(0, len(index) - 1, n_windows + 1).astype(int)
    out = []
    for w in range(n_windows):
        lead = max(0, bounds[w] - warmup)
        sl = {s: df.loc[index[lead]:index[bounds[w + 1]]] for s, df in data.items()}
        try:
            r = run_rotation_backtest(sl, cfg)
        except Exception:
            continue
        out.append({
            "window": f"W{w + 1}",
            "start": str(index[bounds[w]].date()),
            "end": str(index[bounds[w + 1]].date()),
            "cagr": round(r.cagr_pct, 1),
            "max_dd": round(r.max_drawdown_pct, 1),
            "bench_cagr": round(r.benchmark_cagr_pct, 1) if r.benchmark_cagr_pct is not None else None,
            "rotations": r.num_rotations,
        })
    return out
