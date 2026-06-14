"""Validation rigor: is the edge real, or is it curve-fit hope?

A single backtest number is the easiest thing in the world to fool yourself
with. These tools attack that from three angles:

1. Walk-forward — slice history into sequential out-of-sample windows and
   evaluate each. A strategy with a real edge holds up across windows; a
   curve-fit one shines in one period and dies in the next.
2. Parameter sensitivity — sweep the key knobs and look at the metric
   *surface*. A robust edge sits on a broad plateau; a fragile one is a
   lone spike surrounded by losses (you fit the noise).
3. Monte Carlo — resample the trade sequence thousands of times to get a
   DISTRIBUTION of outcomes (return, max drawdown) instead of the one path
   history happened to take. The tail is what actually risks the account.

None of this places a trade or touches the broker. It is pure analysis on
historical data, meant to be run before trusting the system with money.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from backtesting.backtest_engine import run_backtest
from core.config import Config


@dataclass
class WindowResult:
    label: str
    start: str
    end: str
    total_return_pct: float
    max_drawdown_pct: float
    num_trades: int
    profit_factor: float
    sharpe_ratio: float
    buy_hold_return_pct: Optional[float]


@dataclass
class WalkForwardReport:
    windows: list[WindowResult] = field(default_factory=list)

    @property
    def consistency_pct(self) -> float:
        """Fraction of windows (with trades) that were profitable."""
        traded = [w for w in self.windows if w.num_trades > 0]
        if not traded:
            return 0.0
        return sum(1 for w in traded if w.total_return_pct > 0) / len(traded) * 100.0

    def render(self) -> str:
        lines = ["Walk-forward (out-of-sample windows):", ""]
        header = f"  {'Window':<10}{'Return':>10}{'MaxDD':>9}{'Trades':>8}{'PF':>7}{'Sharpe':>8}"
        lines.append(header)
        lines.append("  " + "-" * (len(header) - 2))
        for w in self.windows:
            lines.append(
                f"  {w.label:<10}{w.total_return_pct:>+9.1f}%{w.max_drawdown_pct:>8.1f}%"
                f"{w.num_trades:>8}{w.profit_factor:>7.2f}{w.sharpe_ratio:>8.2f}"
            )
        lines.append("")
        lines.append(f"  Profitable windows: {self.consistency_pct:.0f}% "
                     f"(of windows that traded)")
        return "\n".join(lines)


def _slice(data: dict[str, pd.DataFrame], start, end) -> dict[str, pd.DataFrame]:
    out = {}
    for a, df in data.items():
        s = df[(df.index >= start) & (df.index <= end)]
        if len(s) > 0:
            out[a] = s
    return out


def _warmup_bars(cfg: Config) -> int:
    """Bars of lead-in a window needs before it can trade: the longest MA
    in play (strategy slow MA and the regime filter's benchmark/breadth MAs)
    plus a small buffer."""
    rc = cfg.strategy.regime
    return max(
        cfg.strategy.trend_following.slow_ma,
        rc.benchmark_ma if rc.enabled else 0,
        rc.breadth_ma if rc.enabled else 0,
    ) + 5


def walk_forward(
    data: dict[str, pd.DataFrame], cfg: Config, n_windows: int = 4
) -> WalkForwardReport:
    """Run the backtest on `n_windows` sequential periods of history.

    Each test window carries a warmup lead-in so indicators and the regime
    filter are valid by the time the window's own period begins — otherwise
    a short slice is all warmup and never trades. The strategy fits no
    parameters, so every window is genuinely out-of-sample; this measures
    whether the edge is stable across regimes, not luck in one stretch."""
    index = None
    for df in data.values():
        index = df.index if index is None else index.union(df.index)
    index = index.sort_values()
    warmup = _warmup_bars(cfg)
    # With prepended lead-in, only the first window needs a standalone warmup;
    # later windows borrow theirs from prior data. Require warmup plus a small
    # tradeable budget per window.
    if len(index) < warmup + n_windows * 15:
        raise ValueError(
            "Not enough history for the requested windows once warmup is "
            "accounted for"
        )

    bounds = np.linspace(0, len(index) - 1, n_windows + 1).astype(int)
    report = WalkForwardReport()
    for w in range(n_windows):
        lead = max(0, bounds[w] - warmup)          # prepend warmup lead-in
        start, end = index[lead], index[bounds[w + 1]]
        period_start = index[bounds[w]]
        sliced = _slice(data, start, end)
        if not sliced:
            continue
        try:
            res = run_backtest(sliced, cfg)
        except Exception:
            continue
        r = res.report
        report.windows.append(WindowResult(
            label=f"W{w + 1}",
            start=str(period_start.date()), end=str(end.date()),
            total_return_pct=r.total_return_pct,
            max_drawdown_pct=r.max_drawdown_pct,
            num_trades=r.num_trades,
            profit_factor=r.profit_factor if np.isfinite(r.profit_factor) else 0.0,
            sharpe_ratio=r.sharpe_ratio,
            buy_hold_return_pct=r.buy_hold_return_pct,
        ))
    return report


@dataclass
class SensitivityPoint:
    params: dict
    total_return_pct: float
    max_drawdown_pct: float
    num_trades: int
    sharpe_ratio: float


def parameter_sensitivity(
    data: dict[str, pd.DataFrame],
    cfg: Config,
    grid: dict[str, list],
) -> list[SensitivityPoint]:
    """Sweep trend-following parameters and report the metric surface.

    `grid` maps a TrendFollowingConfig field name to a list of values, e.g.
    {"fast_ma": [20, 50, 80], "atr_stop_multiple": [1.5, 2.0, 2.5]}.
    Robustness shows up as a broad plateau of positive results; a single
    spike means the parameters are fit to noise."""
    keys = list(grid.keys())
    points: list[SensitivityPoint] = []
    for combo in itertools.product(*(grid[k] for k in keys)):
        params = dict(zip(keys, combo))
        tf = cfg.strategy.trend_following.model_copy(update=params)
        if tf.fast_ma >= tf.slow_ma:
            continue
        trial = cfg.model_copy(update={
            "strategy": cfg.strategy.model_copy(update={"trend_following": tf})
        })
        try:
            res = run_backtest(data, trial)
        except Exception:
            continue
        r = res.report
        points.append(SensitivityPoint(
            params=params,
            total_return_pct=r.total_return_pct,
            max_drawdown_pct=r.max_drawdown_pct,
            num_trades=r.num_trades,
            sharpe_ratio=r.sharpe_ratio,
        ))
    return points


def render_sensitivity(points: list[SensitivityPoint]) -> str:
    if not points:
        return "Parameter sensitivity: no valid parameter combinations."
    lines = ["Parameter sensitivity (curve-fit check):", ""]
    keys = list(points[0].params.keys())
    header = "  " + "".join(f"{k:>14}" for k in keys) + \
             f"{'Return':>10}{'MaxDD':>9}{'Trades':>8}{'Sharpe':>8}"
    lines.append(header)
    lines.append("  " + "-" * (len(header) - 2))
    for p in sorted(points, key=lambda x: x.total_return_pct, reverse=True):
        row = "  " + "".join(f"{p.params[k]:>14}" for k in keys)
        row += (f"{p.total_return_pct:>+9.1f}%{p.max_drawdown_pct:>8.1f}%"
                f"{p.num_trades:>8}{p.sharpe_ratio:>8.2f}")
        lines.append(row)
    returns = [p.total_return_pct for p in points]
    positive = sum(1 for r in returns if r > 0)
    lines.append("")
    lines.append(f"  {positive}/{len(points)} parameter sets profitable; "
                 f"median return {np.median(returns):+.1f}%, "
                 f"spread {min(returns):+.1f}%..{max(returns):+.1f}%")
    return "\n".join(lines)


@dataclass
class MonteCarloReport:
    n_sims: int
    median_return_pct: float
    p5_return_pct: float
    p95_return_pct: float
    median_max_dd_pct: float
    p95_max_dd_pct: float       # the bad-luck drawdown tail
    prob_loss_pct: float
    prob_dd_exceeds_limit_pct: float
    dd_limit_pct: float

    def render(self) -> str:
        return "\n".join([
            f"Monte Carlo ({self.n_sims} resampled trade sequences):",
            "",
            f"  Return   median {self.median_return_pct:+.1f}%   "
            f"5th pct {self.p5_return_pct:+.1f}%   "
            f"95th pct {self.p95_return_pct:+.1f}%",
            f"  Max DD   median {self.median_max_dd_pct:.1f}%   "
            f"95th pct {self.p95_max_dd_pct:.1f}%",
            f"  P(losing overall):           {self.prob_loss_pct:.1f}%",
            f"  P(drawdown > {self.dd_limit_pct:.0f}% limit):     "
            f"{self.prob_dd_exceeds_limit_pct:.1f}%",
        ])


def monte_carlo(
    trade_pnls: list[float],
    starting_equity: float,
    cfg: Config,
    n_sims: int = 5000,
    seed: int = 12,
) -> Optional[MonteCarloReport]:
    """Bootstrap the realized trades to map the outcome distribution.

    Each simulation draws len(trades) trades WITH REPLACEMENT from the
    realized set — "what if I'd caught a different sample of trades like
    these?". Sampling with replacement (rather than just reshuffling order)
    is what makes the return distribution non-degenerate: a plain shuffle
    leaves the P&L sum unchanged, so only resampling reveals the spread.
    The median is the typical outcome; the 5th-percentile return and the
    95th-percentile drawdown are the bad-luck tails that threaten the
    account. Returns None if there are too few trades."""
    pnls = np.array([p for p in trade_pnls], dtype=float)
    if len(pnls) < 5:
        return None
    rng = np.random.default_rng(seed)
    dd_limit = cfg.risk.max_total_drawdown_pct
    n = len(pnls)

    finals, max_dds = [], []
    for _ in range(n_sims):
        seq = rng.choice(pnls, size=n, replace=True)
        equity = starting_equity + np.cumsum(seq)
        equity = np.concatenate([[starting_equity], equity])
        finals.append(equity[-1])
        running_max = np.maximum.accumulate(equity)
        dd = np.max((running_max - equity) / running_max) * 100.0
        max_dds.append(dd)

    finals = np.array(finals)
    returns = (finals / starting_equity - 1) * 100.0
    max_dds = np.array(max_dds)
    return MonteCarloReport(
        n_sims=n_sims,
        median_return_pct=float(np.median(returns)),
        p5_return_pct=float(np.percentile(returns, 5)),
        p95_return_pct=float(np.percentile(returns, 95)),
        median_max_dd_pct=float(np.median(max_dds)),
        p95_max_dd_pct=float(np.percentile(max_dds, 95)),
        prob_loss_pct=float(np.mean(returns < 0) * 100.0),
        prob_dd_exceeds_limit_pct=float(np.mean(max_dds > dd_limit) * 100.0),
        dd_limit_pct=dd_limit,
    )
