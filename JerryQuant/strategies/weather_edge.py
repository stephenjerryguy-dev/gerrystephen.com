"""Weather edge: calibrated ensemble probabilities vs Kalshi temperature books.

Why this venue is worth the trouble: unlike equities, the settlement of a
temperature contract is a physical fact a public ensemble forecast genuinely
informs. The edge, if any, comes from calibration — not from having opinions.

Two details do most of the work, and both were verified against live data:

1. Settlement is an INTEGER. The NWS Climatological Report reports whole °F, so
   "88-89°" is the event {88, 89}, which in continuous temperature is
   [87.5, 90.0). Treating the strikes as continuous bounds misprices every bin
   by half a degree at each edge.
2. Kalshi encodes strikes structurally (`strike_type` + floor/cap), so nothing
   here parses a title string. Titles are for humans.

Sizing is fractional Kelly through risk.binary_sizing, and every proposal still
goes to the same human approval queue as an equity trade.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Optional

from data_sources import weather

# A book this wide means the "edge" is mostly spread.
MAX_SPREAD = 0.10
# Below this the book is too thin to trust a printed price.
MIN_OPEN_INTEREST = 100.0


@dataclass
class WeatherEdge:
    market_ticker: str
    title: str
    model_probability: float
    ask: float
    edge: float
    lo: Optional[float]
    hi: Optional[float]

    def describe(self) -> str:
        return (f"{self.market_ticker}: model {self.model_probability:.0%} vs "
                f"ask {self.ask:.0%} → edge {self.edge:+.0%}")


def strike_interval(market) -> Optional[tuple[Optional[float], Optional[float]]]:
    """Continuous [lo, hi) interval of settled temperature that pays YES.

    Converts an integer-degree event into continuous bounds by widening each
    inclusive endpoint by half a degree — the step that makes the arithmetic
    match how the contract actually settles.

      greater, floor F -> integer T > F      -> T >= F+1 -> [F+0.5, None)
      less,    cap   C -> integer T < C      -> T <= C-1 -> (None, C-0.5)
      between, F..C    -> integer F <= T <= C            -> [F-0.5, C+0.5)

    Returns None for any strike shape not understood, so an unrecognised
    market is skipped rather than guessed at.
    """
    kind = (market.strike_type or "").lower()
    floor_strike = market.floor_strike
    cap_strike = market.cap_strike
    if kind == "greater" and floor_strike is not None:
        return (floor_strike + 0.5, None)
    if kind == "greater_or_equal" and floor_strike is not None:
        return (floor_strike - 0.5, None)
    if kind == "less" and cap_strike is not None:
        return (None, cap_strike - 0.5)
    if kind == "less_or_equal" and cap_strike is not None:
        return (None, cap_strike + 0.5)
    if kind == "between" and floor_strike is not None and cap_strike is not None:
        return (floor_strike - 0.5, cap_strike + 0.5)
    return None


def event_date(market, tz_name: str) -> Optional[dt.date]:
    """Event date from the ticker's date segment (e.g. KXHIGHNY-26JUL22-T91)."""
    parts = str(market.ticker).split("-")
    if len(parts) < 2:
        return None
    try:
        return dt.datetime.strptime(parts[1], "%y%b%d").date()
    except ValueError:
        return None


def find_edges(markets, members: list[float], calibration: weather.Calibration,
               min_edge: float) -> tuple[list[WeatherEdge], list[str]]:
    """Score each market against the calibrated forecast.

    Returns (edges, notes). Anything skipped is explained in notes rather than
    dropped silently — a quiet skip is indistinguishable from 'no edge'.
    """
    edges: list[WeatherEdge] = []
    notes: list[str] = []
    for market in markets:
        interval = strike_interval(market)
        if interval is None:
            notes.append(f"{market.ticker}: unrecognised strike "
                         f"({market.strike_type}) — skipped")
            continue
        if not market.is_tradable:
            notes.append(f"{market.ticker}: no usable two-sided book — skipped")
            continue
        spread = market.spread
        if spread is not None and spread > MAX_SPREAD:
            notes.append(f"{market.ticker}: spread {spread:.0%} too wide — skipped")
            continue
        if (market.open_interest or 0) < MIN_OPEN_INTEREST:
            notes.append(f"{market.ticker}: open interest "
                         f"{market.open_interest or 0:.0f} too thin — skipped")
            continue
        lo, hi = interval
        probability = weather.probability_within(members, calibration, lo, hi)
        edge = market.edge_vs(probability)
        if edge is None or edge < min_edge:
            continue
        edges.append(WeatherEdge(
            market_ticker=market.ticker, title=market.title,
            model_probability=probability, ask=market.yes_ask,
            edge=edge, lo=lo, hi=hi))
    edges.sort(key=lambda e: e.edge, reverse=True)
    return edges, notes
