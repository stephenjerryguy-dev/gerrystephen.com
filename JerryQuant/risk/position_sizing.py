"""Position sizing.

Risk-based sizing: position size is derived from the distance to the stop
loss so that a stopped-out trade loses at most `max_risk_per_trade_pct` of
account equity. If a valid size cannot be computed, the trade must not
happen — callers are expected to treat PositionSizeError as a hard block.
"""

from __future__ import annotations

from dataclasses import dataclass


class PositionSizeError(Exception):
    """Raised when a safe position size cannot be calculated."""


@dataclass
class PositionSize:
    units: float
    value_usd: float
    dollar_risk: float
    risk_pct_of_equity: float
    capped_by_allocation: bool


def calculate_position_size(
    equity: float,
    entry: float,
    stop: float,
    max_risk_pct: float,
    max_position_pct: float,
) -> PositionSize:
    """Size a long position from equity, entry, and stop.

    Raises PositionSizeError on any input that would make the size
    meaningless (no stop, stop above entry, non-positive equity, etc.).
    """
    if equity <= 0:
        raise PositionSizeError(f"Equity must be positive, got {equity}")
    if entry <= 0:
        raise PositionSizeError(f"Entry price must be positive, got {entry}")
    if stop is None:
        raise PositionSizeError("No stop loss — trade is not allowed without one")
    if stop <= 0:
        raise PositionSizeError(f"Stop must be positive, got {stop}")
    if stop >= entry:
        raise PositionSizeError(
            f"Stop {stop} must be below entry {entry} for a long position"
        )

    risk_per_unit = entry - stop
    max_dollar_risk = equity * (max_risk_pct / 100.0)
    units = max_dollar_risk / risk_per_unit

    # Cap by single-asset allocation limit.
    max_value = equity * (max_position_pct / 100.0)
    capped = False
    if units * entry > max_value:
        units = max_value / entry
        capped = True

    if units <= 0:
        raise PositionSizeError("Computed position size is zero or negative")

    dollar_risk = units * risk_per_unit
    return PositionSize(
        units=units,
        value_usd=units * entry,
        dollar_risk=dollar_risk,
        risk_pct_of_equity=dollar_risk / equity * 100.0,
        capped_by_allocation=capped,
    )
