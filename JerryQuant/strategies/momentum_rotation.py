"""Always-invested momentum rotation.

The philosophy (owner's): don't sit in cash — always hold the strongest
asset, and the skill is knowing when to sell and what to rotate into next.
The one exception is a genuine market-wide downturn: when the whole pool is
weaker than cash, step to the defensive asset (T-bills) until strength
returns. That is the "whole market down -> sell all, hold cash" rule.

This module is pure decision logic over price series — no I/O, no broker —
so it is shared by the backtest and the live agent and is easy to test.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import pandas as pd

from core.config import Config


def trailing_momentum(close: pd.Series, lookback: int, asof: int = -1) -> Optional[float]:
    """Total return over the trailing `lookback` bars ending at `asof`.
    None when there isn't enough history."""
    if close is None or len(close) <= lookback:
        return None
    end = close.iloc[asof]
    start = close.iloc[asof - lookback]
    if start <= 0 or pd.isna(start) or pd.isna(end):
        return None
    return float(end / start - 1.0)


@dataclass
class RotationDecision:
    target: str                         # symbol to hold (rotation asset or defensive)
    risk_on: bool                       # False => parked in the defensive asset
    ranking: list[tuple[str, float]] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)

    def render(self) -> str:
        rank = ", ".join(f"{s} {m * 100:+.1f}%" for s, m in self.ranking)
        return f"hold {self.target} ({'risk-on' if self.risk_on else 'defensive'}) | {rank}"


def decide_target(closes: dict[str, pd.Series], cfg: Config,
                  asof: int = -1) -> RotationDecision:
    """Pick what to hold from the rotation pool given price history.

    Rank the pool by trailing momentum; hold the strongest — UNLESS its
    momentum is below the defensive asset's (the cash filter), in which case
    hold the defensive asset. Conservative on missing data: an asset without
    enough history simply isn't ranked, and if none can be ranked we default
    to the defensive asset rather than guess."""
    rc = cfg.strategy.rotation
    ranking: list[tuple[str, float]] = []
    for s in rc.rotation_assets:
        m = trailing_momentum(closes.get(s), rc.lookback_days, asof)
        if m is not None:
            ranking.append((s, m))
    ranking.sort(key=lambda x: x[1], reverse=True)

    defensive_mom = trailing_momentum(
        closes.get(rc.defensive_asset), rc.lookback_days, asof
    ) or 0.0

    if not ranking:
        return RotationDecision(
            target=rc.defensive_asset, risk_on=False, ranking=[],
            reasons=["no rotation-asset data — holding defensive"],
        )

    best, best_mom = ranking[0]
    if best_mom > defensive_mom:
        return RotationDecision(
            target=best, risk_on=True, ranking=ranking,
            reasons=[f"{best} strongest ({best_mom * 100:+.1f}% over "
                     f"{rc.lookback_days}d), above cash ({defensive_mom * 100:+.1f}%)"],
        )
    return RotationDecision(
        target=rc.defensive_asset, risk_on=False, ranking=ranking,
        reasons=[f"whole pool below cash (best {best} {best_mom * 100:+.1f}% "
                 f"<= cash {defensive_mom * 100:+.1f}%) — sell all, hold "
                 f"{rc.defensive_asset}"],
    )
