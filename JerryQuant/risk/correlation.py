"""Correlation-aware exposure and sizing.

"Max 3 positions, 40% crypto" reads like diversification, but BTC, ETH and
SOL routinely run ~0.8 correlated — three crypto positions are really one
leveraged bet. Two defenses:

1. Cluster caps: named clusters (crypto, equity_index, ...) each carry a
   combined allocation ceiling, enforced alongside the existing per-asset
   and crypto caps.
2. Sizing haircut: a new position that is highly correlated with what is
   already open is sized DOWN, so adding the third correlated name does not
   add a third unit of the same risk.

Correlations are measured from realized daily returns when history is
available, and fall back to the static cluster map when it is not. The
haircut only ever SHRINKS a position; it can never enlarge one.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

from core.config import Config
from database.models import Position


def cluster_for(asset: str, clusters: dict[str, list[str]]) -> Optional[str]:
    """Name of the cluster an asset belongs to, or None."""
    a = asset.upper().replace("-USD", "")
    for name, members in clusters.items():
        if a in {m.upper().replace("-USD", "") for m in members}:
            return name
    return None


def check_cluster_exposure(
    candidate_asset: str,
    candidate_value_usd: float,
    equity: float,
    open_positions: list[Position],
    position_prices: dict[str, float],
    cfg: Config,
) -> list[str]:
    """Return violated cluster caps for adding the candidate. Empty = ok."""
    cc = cfg.risk.correlation
    if not cc.enabled or equity <= 0:
        return []
    cname = cluster_for(candidate_asset, cc.clusters)
    if cname is None:
        return []

    def mark(p: Position) -> float:
        return p.value(position_prices.get(p.asset, p.entry_price))

    same = sum(
        mark(p) for p in open_positions
        if cluster_for(p.asset, cc.clusters) == cname
    )
    cluster_pct = (same + candidate_value_usd) / equity * 100.0
    if cluster_pct > cc.max_cluster_pct:
        return [
            f"{cname} cluster allocation {cluster_pct:.1f}% would exceed "
            f"cluster cap {cc.max_cluster_pct:.1f}%"
        ]
    return []


def realized_correlation(
    a: pd.Series, b: pd.Series, lookback: int
) -> Optional[float]:
    """Pearson correlation of daily returns over the recent lookback.
    None when there is not enough overlapping history."""
    ra = a.pct_change().dropna().tail(lookback)
    rb = b.pct_change().dropna().tail(lookback)
    joined = pd.concat([ra, rb], axis=1, join="inner").dropna()
    if len(joined) < max(20, lookback // 3):
        return None
    if joined.iloc[:, 0].std() == 0 or joined.iloc[:, 1].std() == 0:
        return None
    c = joined.iloc[:, 0].corr(joined.iloc[:, 1])
    return None if pd.isna(c) else float(c)


def correlation_haircut(
    candidate_asset: str,
    open_positions: list[Position],
    closes: dict[str, pd.Series],
    cfg: Config,
) -> tuple[float, Optional[str]]:
    """Sizing multiplier in (0, 1] for the candidate given open positions.

    Uses the worst (highest) correlation between the candidate and any open
    position. Above `haircut_threshold`, the multiplier scales linearly from
    1.0 down to (1 - max_haircut) as correlation goes from the threshold to
    1.0. Falls back to the static cluster map when returns are unavailable.
    Returns (multiplier, explanation-or-None).
    """
    cc = cfg.risk.correlation
    if not cc.enabled or not open_positions:
        return 1.0, None

    cand_close = closes.get(candidate_asset)
    worst_corr = 0.0
    worst_with = None
    for p in open_positions:
        corr = None
        if cand_close is not None and p.asset in closes:
            corr = realized_correlation(
                cand_close, closes[p.asset], cc.lookback_days
            )
        if corr is None:
            # Fallback: same static cluster implies high assumed correlation.
            same_cluster = (
                cluster_for(candidate_asset, cc.clusters) is not None
                and cluster_for(candidate_asset, cc.clusters)
                == cluster_for(p.asset, cc.clusters)
            )
            corr = 0.8 if same_cluster else 0.0
        if corr > worst_corr:
            worst_corr = corr
            worst_with = p.asset

    if worst_corr <= cc.haircut_threshold:
        return 1.0, None

    span = max(1e-9, 1.0 - cc.haircut_threshold)
    frac = min(1.0, (worst_corr - cc.haircut_threshold) / span)
    multiplier = 1.0 - cc.max_haircut * frac
    multiplier = max(1.0 - cc.max_haircut, min(1.0, multiplier))
    return multiplier, (
        f"sized down x{multiplier:.2f}: {worst_corr:.2f} correlation with "
        f"open {worst_with}"
    )
