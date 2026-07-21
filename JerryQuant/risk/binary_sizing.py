"""Position sizing for binary (0–1) prediction-market contracts.

Equity sizing (risk/position_sizing.py) derives size from the distance to a
stop loss — the right model for a share whose price can wander anywhere.
Binary event contracts (Polymarket / Kalshi) are different: they resolve to
exactly $0 or $1, so the entire premium is at risk and the natural sizing
rule is the **Kelly criterion** on the edge between your estimated true
probability and the market price.

Two hard rules, matching JerryQuant's capital-preservation philosophy:

1. FRACTIONAL Kelly only (default quarter). Full Kelly is too aggressive for
   real money — it maximizes growth but courts brutal drawdowns. The fraction
   is hard-capped (see risk caps in core.config) so config can never arm full
   Kelly by accident.
2. No edge → no size. If your probability does not beat the market price by
   the required margin, the function returns zero units. The agent never bets
   a non-positive edge.

The stake is additionally capped by a max-position fraction of equity, so a
single high-"edge" contract can never swallow the account.
"""

from __future__ import annotations

from dataclasses import dataclass


class BinarySizeError(Exception):
    """Raised on inputs that make a binary size meaningless (bad price, etc.)."""


@dataclass
class BinarySize:
    units: float                 # number of contracts/shares to buy
    value_usd: float             # stake = units * price
    dollar_risk: float           # worst-case loss (see calculate_binary_size)
    edge: float                  # true_prob - price (can be <= 0)
    full_kelly_fraction: float   # uncapped Kelly fraction of bankroll
    kelly_fraction_used: float   # fractional-Kelly multiplier actually applied
    capped_by_allocation: bool   # True if the max-position cap bound the size

    @property
    def is_tradable(self) -> bool:
        return self.units > 0


def calculate_binary_size(
    equity: float,
    price: float,
    true_prob: float,
    max_position_pct: float,
    kelly_fraction: float = 0.25,
    min_edge: float = 0.0,
    stop: float | None = None,
) -> BinarySize:
    """Size a long position in a binary contract via fractional Kelly.

    Args:
        equity: account equity in USD.
        price: current contract price, strictly in (0, 1) — the implied
            market probability of the YES outcome you are buying.
        true_prob: your estimated probability the contract resolves in your
            favour, in [0, 1].
        max_position_pct: hard cap on stake as a % of equity.
        kelly_fraction: fractional-Kelly multiplier (0.25 = quarter Kelly).
        min_edge: minimum (true_prob - price) required to take any size.
        stop: optional exit price below `price` at which you'd cut the
            position. If given, worst-case dollar_risk is units*(price-stop)
            rather than the full premium; otherwise the full premium is at
            risk (the honest default for a contract that can resolve to $0).

    Returns a BinarySize. units == 0 means "no positive edge — do not trade"
    (not an error). Raises BinarySizeError only on structurally invalid input.
    """
    if equity <= 0:
        raise BinarySizeError(f"Equity must be positive, got {equity}")
    if not (0.0 < price < 1.0):
        raise BinarySizeError(f"Price must be strictly between 0 and 1, got {price}")
    if not (0.0 <= true_prob <= 1.0):
        raise BinarySizeError(f"true_prob must be in [0, 1], got {true_prob}")
    if not (0.0 < kelly_fraction <= 1.0):
        raise BinarySizeError(
            f"kelly_fraction must be in (0, 1], got {kelly_fraction}"
        )
    if stop is not None and not (0.0 <= stop < price):
        raise BinarySizeError(
            f"stop {stop} must be in [0, price) for a long binary position "
            f"(price={price})"
        )

    edge = true_prob - price

    # Kelly for a bet that pays (1-price) on win and loses `price` on loss:
    #   b = (1 - price) / price          (net odds received on the stake)
    #   f* = (b*p - q) / b = p - q/b     with p=true_prob, q=1-true_prob
    b = (1.0 - price) / price
    p = true_prob
    q = 1.0 - p
    full_kelly = (b * p - q) / b  # == p - q/b

    # No edge (or below the required margin) → zero size, never a negative bet.
    if edge <= 0 or edge < min_edge or full_kelly <= 0:
        return BinarySize(
            units=0.0,
            value_usd=0.0,
            dollar_risk=0.0,
            edge=edge,
            full_kelly_fraction=full_kelly,
            kelly_fraction_used=kelly_fraction,
            capped_by_allocation=False,
        )

    stake = equity * full_kelly * kelly_fraction

    # Hard cap by single-position allocation limit.
    max_value = equity * (max_position_pct / 100.0)
    capped = False
    if stake > max_value:
        stake = max_value
        capped = True

    units = stake / price
    if units <= 0:
        return BinarySize(
            units=0.0, value_usd=0.0, dollar_risk=0.0, edge=edge,
            full_kelly_fraction=full_kelly, kelly_fraction_used=kelly_fraction,
            capped_by_allocation=capped,
        )

    risk_per_unit = (price - stop) if stop is not None else price
    return BinarySize(
        units=units,
        value_usd=units * price,
        dollar_risk=units * risk_per_unit,
        edge=edge,
        full_kelly_fraction=full_kelly,
        kelly_fraction_used=kelly_fraction,
        capped_by_allocation=capped,
    )
