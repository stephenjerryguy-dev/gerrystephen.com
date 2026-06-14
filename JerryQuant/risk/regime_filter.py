"""Market-regime gate.

Trend-following makes money in trends and bleeds it in bear markets and
chop. An individual asset can look strong while the whole market is rolling
over — so before ANY new long, we check the regime of the broad market:

1. Benchmark uptrend: the benchmark (SPY by default) must be above its own
   long moving average. Below it, we simply do not open new longs.
2. Breadth: a minimum fraction of the watchlist must themselves be above
   their long MA. A rally led by one name is not a healthy tape.
3. Volatility (optional): if benchmark ATR% blows out past a ceiling, the
   tape is disorderly and new risk waits.

This gate only ever BLOCKS new entries. It never forces a trade and never
touches exits — a position already open is managed by its own stop/target
logic regardless of regime.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from core.config import Config


@dataclass
class RegimeAssessment:
    risk_on: bool
    breadth_pct: float
    benchmark_uptrend: bool
    benchmark_atr_pct: float
    reasons: list[str] = field(default_factory=list)

    def render(self) -> str:
        state = "RISK-ON" if self.risk_on else "RISK-OFF"
        return (
            f"Regime: {state} | breadth {self.breadth_pct:.0f}% | "
            f"benchmark {'up' if self.benchmark_uptrend else 'down'}trend | "
            f"benchmark ATR {self.benchmark_atr_pct:.2f}%"
            + (f" | {'; '.join(self.reasons)}" if self.reasons else "")
        )


def _above_ma(df: pd.DataFrame, window: int) -> bool | None:
    """Is the latest close above its `window`-bar SMA? None if too short."""
    if df is None or len(df) < window:
        return None
    ma = df["close"].rolling(window).mean().iloc[-1]
    if pd.isna(ma):
        return None
    return float(df["close"].iloc[-1]) > float(ma)


def _atr_pct(df: pd.DataFrame, period: int = 14) -> float:
    if df is None or len(df) < period + 1:
        return 0.0
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    atr = tr.rolling(period).mean().iloc[-1]
    close = float(df["close"].iloc[-1])
    if pd.isna(atr) or close <= 0:
        return 0.0
    return float(atr) / close * 100.0


def assess_regime(
    data: dict[str, pd.DataFrame],
    cfg: Config,
) -> RegimeAssessment:
    """Assess the market regime from the watchlist data.

    `data` maps asset -> daily OHLCV (the same dict the cycle already has).
    Conservative on missing data: if the benchmark is required but absent,
    the regime is risk-off (we don't trade blind)."""
    rc = cfg.strategy.regime
    reasons: list[str] = []

    # --- breadth across the whole universe ---
    checks = [(_above_ma(df, rc.breadth_ma)) for df in data.values()]
    valid = [c for c in checks if c is not None]
    breadth_pct = (sum(1 for c in valid if c) / len(valid) * 100.0) if valid else 0.0

    # --- benchmark trend + volatility ---
    bench = data.get(rc.benchmark)
    bench_up = _above_ma(bench, rc.benchmark_ma)
    bench_atr = _atr_pct(bench) if bench is not None else 0.0
    # Distinguish "operator did not put the benchmark in the universe"
    # (gate on breadth only) from "benchmark is configured but its data
    # failed/went stale" (trade blind -> risk-off).
    benchmark_configured = rc.benchmark.upper() in {
        a.upper() for a in cfg.watchlist.all_assets
    }

    if not rc.enabled:
        return RegimeAssessment(
            risk_on=True,
            breadth_pct=breadth_pct,
            benchmark_uptrend=bool(bench_up),
            benchmark_atr_pct=bench_atr,
            reasons=["regime filter disabled"],
        )

    risk_on = True

    if rc.require_benchmark_uptrend and benchmark_configured:
        if bench_up is None:
            risk_on = False
            reasons.append(
                f"benchmark {rc.benchmark} data unavailable — no new longs"
            )
        elif not bench_up:
            risk_on = False
            reasons.append(
                f"benchmark {rc.benchmark} below its {rc.benchmark_ma}d MA"
            )
    elif rc.require_benchmark_uptrend and not benchmark_configured:
        reasons.append(
            f"benchmark {rc.benchmark} not in watchlist — gating on breadth only"
        )

    if valid and breadth_pct < rc.min_breadth_pct:
        risk_on = False
        reasons.append(
            f"breadth {breadth_pct:.0f}% below floor {rc.min_breadth_pct:.0f}%"
        )

    if rc.max_benchmark_atr_pct > 0 and bench_atr > rc.max_benchmark_atr_pct:
        risk_on = False
        reasons.append(
            f"benchmark volatility {bench_atr:.2f}% above "
            f"{rc.max_benchmark_atr_pct:.2f}% ceiling"
        )

    if risk_on:
        reasons.append("market healthy: new longs permitted")

    return RegimeAssessment(
        risk_on=risk_on,
        breadth_pct=breadth_pct,
        benchmark_uptrend=bool(bench_up),
        benchmark_atr_pct=bench_atr,
        reasons=reasons,
    )
