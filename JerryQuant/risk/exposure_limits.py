"""Portfolio exposure limits.

Checks a candidate position against position-count, per-asset, and
crypto-allocation caps. Returns the list of violated rules; an empty list
means the trade passes exposure checks.
"""

from __future__ import annotations

from database.models import Position


def check_exposure(
    candidate_asset: str,
    candidate_value_usd: float,
    candidate_is_crypto: bool,
    equity: float,
    open_positions: list[Position],
    position_prices: dict[str, float],
    max_open_positions: int,
    max_single_asset_pct: float,
    max_crypto_pct: float,
    crypto_assets: set[str],
) -> list[str]:
    """position_prices maps asset -> current price for marking open positions."""
    violations: list[str] = []

    if equity <= 0:
        return ["Equity is zero or negative — no new exposure allowed"]

    if len(open_positions) >= max_open_positions:
        violations.append(
            f"Already at max open positions ({max_open_positions})"
        )

    if any(p.asset == candidate_asset for p in open_positions):
        violations.append(f"Position already open in {candidate_asset}")

    def mark(p: Position) -> float:
        return p.value(position_prices.get(p.asset, p.entry_price))

    asset_value = candidate_value_usd + sum(
        mark(p) for p in open_positions if p.asset == candidate_asset
    )
    asset_pct = asset_value / equity * 100.0
    if asset_pct > max_single_asset_pct:
        violations.append(
            f"{candidate_asset} allocation {asset_pct:.1f}% would exceed "
            f"single-asset cap {max_single_asset_pct:.1f}%"
        )

    crypto_value = sum(mark(p) for p in open_positions if p.asset in crypto_assets)
    if candidate_is_crypto:
        crypto_value += candidate_value_usd
    crypto_pct = crypto_value / equity * 100.0
    if candidate_is_crypto and crypto_pct > max_crypto_pct:
        violations.append(
            f"Crypto allocation {crypto_pct:.1f}% would exceed cap "
            f"{max_crypto_pct:.1f}%"
        )

    return violations


def exposure_summary(
    equity: float,
    open_positions: list[Position],
    position_prices: dict[str, float],
    crypto_assets: set[str],
) -> tuple[float, float]:
    """Returns (total exposure %, crypto exposure %) of equity."""
    if equity <= 0:
        return 0.0, 0.0
    total = sum(
        p.value(position_prices.get(p.asset, p.entry_price))
        for p in open_positions
    )
    crypto = sum(
        p.value(position_prices.get(p.asset, p.entry_price))
        for p in open_positions
        if p.asset in crypto_assets
    )
    return total / equity * 100.0, crypto / equity * 100.0
