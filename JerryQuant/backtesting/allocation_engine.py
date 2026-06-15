"""Backtest for the diversified target-allocation strategy.

Hold fixed target weights; let them drift with the market; rebalance back to
targets only when a holding drifts past the band. Turnover costs are charged
on each rebalance. Benchmarked against buy-and-hold SPY so the diversified
mix's lower-drawdown / different-return profile is visible.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

from core.config import Config
from strategies import allocation


@dataclass
class AllocationResult:
    total_return_pct: float
    cagr_pct: float
    max_drawdown_pct: float
    num_rebalances: int
    final_equity: float
    equity_curve: pd.Series
    benchmark_cagr_pct: Optional[float] = None
    benchmark_max_dd_pct: Optional[float] = None
    benchmark_symbol: Optional[str] = None

    def render(self) -> str:
        lines = [
            f"  Total return        {self.total_return_pct:+.0f}%",
            f"  CAGR                {self.cagr_pct:+.1f}%",
            f"  Max drawdown        {self.max_drawdown_pct:.1f}%",
            f"  Rebalances          {self.num_rebalances}",
        ]
        if self.benchmark_cagr_pct is not None:
            lines.append(
                f"  Buy & hold {self.benchmark_symbol:<5} CAGR "
                f"{self.benchmark_cagr_pct:+.1f}%  MaxDD {self.benchmark_max_dd_pct:.1f}%"
            )
        return "\n".join(lines)


def run_allocation_backtest(data: dict[str, pd.DataFrame], cfg: Config,
                            cost_pct: Optional[float] = None) -> AllocationResult:
    """`data` maps symbol -> OHLCV df (uses close). Needs every weighted asset."""
    weights = allocation.normalized_weights(cfg)
    if cost_pct is None:
        b = cfg.backtest
        cost_pct = (b.slippage_pct + b.spread_pct / 2 + b.fee_pct) / 100.0

    closes = pd.concat({s: data[s]["close"] for s in weights if s in data},
                       axis=1).dropna()
    missing = [s for s in weights if s not in closes.columns]
    if missing:
        raise ValueError(f"Missing history for: {missing}")
    if len(closes) < 30:
        raise ValueError("Not enough overlapping history")

    rets = closes.pct_change().fillna(0.0)
    band = cfg.strategy.allocation.rebalance_band_pct / 100.0

    # Start at target weights, $1 total.
    values = {s: weights[s] for s in weights}
    eq = 1.0
    curve, dates, rebalances = [], [], 0
    for d in closes.index[1:]:
        for s in values:
            values[s] *= (1 + float(rets.loc[d, s]))
        total = sum(values.values())
        # Drift check against current targets.
        max_drift = max(abs(values[s] - total * weights[s]) for s in values)
        if max_drift > band * total:
            turnover = sum(abs(values[s] - total * weights[s]) for s in values) / 2
            total -= turnover * cost_pct
            values = {s: total * weights[s] for s in weights}
            rebalances += 1
        eq = total
        curve.append(eq)
        dates.append(d)

    c = pd.Series(curve, index=dates)
    years = (c.index[-1] - c.index[0]).days / 365.25
    cagr = (c.iloc[-1] ** (1 / years) - 1) if years > 0 else 0.0
    dd = float(((c - c.cummax()) / c.cummax()).min())

    bench = "SPY" if "SPY" in closes.columns else list(weights)[0]
    bser = closes[bench].loc[c.index[0]:]
    bcagr = (float(bser.iloc[-1] / bser.iloc[0]) ** (1 / years) - 1) if years > 0 else 0.0
    bdd = float(((bser / bser.cummax()) - 1).min())

    return AllocationResult(
        total_return_pct=(c.iloc[-1] - 1) * 100.0,
        cagr_pct=cagr * 100.0,
        max_drawdown_pct=dd * 100.0,
        num_rebalances=rebalances,
        final_equity=float(c.iloc[-1]),
        equity_curve=c,
        benchmark_cagr_pct=bcagr * 100.0,
        benchmark_max_dd_pct=bdd * 100.0,
        benchmark_symbol=bench,
    )
