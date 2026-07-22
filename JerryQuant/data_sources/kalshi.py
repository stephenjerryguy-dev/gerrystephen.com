"""Kalshi market data (public, read-only).

Kalshi is the US-legal, CFTC-regulated event-contract venue — the viable home
for JerryQuant's binary/weather ideas (Polymarket is largely restricted for US
persons, so it is deliberately not supported here).

Field names below were taken from LIVE responses, not from memory: Kalshi's
current API returns `yes_bid_dollars` / `yes_ask_dollars` / `last_price_dollars`
(NOT `yes_bid` / `yes_ask`), and sizes/volumes as `*_fp`. Guessing those would
have silently produced `None` prices and a bot trading on garbage — the same
"never guess at an API you haven't seen" rule the Robinhood broker follows.

Prices are already probabilities: a contract at $0.54 implies a 54% chance.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

BASE_URL = "https://api.elections.kalshi.com/trade-api/v2"


class KalshiUnavailableError(Exception):
    """Kalshi data could not be fetched or parsed — never trade on this."""


def _f(value) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


@dataclass
class KalshiMarket:
    ticker: str
    event_ticker: str
    title: str
    status: str
    yes_bid: Optional[float]      # dollars == probability (0-1)
    yes_ask: Optional[float]
    last_price: Optional[float]
    close_time: Optional[str]
    liquidity: Optional[float]
    volume: Optional[float]
    # Strikes are encoded structurally, never parsed out of the title.
    # 'greater' + floor_strike, 'less' + cap_strike, 'between' + both.
    strike_type: Optional[str] = None
    floor_strike: Optional[float] = None
    cap_strike: Optional[float] = None
    open_interest: Optional[float] = None

    @property
    def mid_price(self) -> Optional[float]:
        """Mid of the yes book — the market's implied probability."""
        if self.yes_bid is not None and self.yes_ask is not None \
                and self.yes_ask > 0:
            return (self.yes_bid + self.yes_ask) / 2.0
        return self.last_price

    @property
    def spread(self) -> Optional[float]:
        if self.yes_bid is None or self.yes_ask is None:
            return None
        return self.yes_ask - self.yes_bid

    @property
    def is_tradable(self) -> bool:
        """Refuse markets with no usable two-sided book — thin event markets
        frequently have none, and a missing price must never become a trade."""
        return (
            self.status in ("active", "open")
            and self.yes_ask is not None and 0 < self.yes_ask < 1
            and self.spread is not None
        )

    def edge_vs(self, true_probability: float) -> Optional[float]:
        """Your estimated probability minus what you'd PAY (the ask).

        Deliberately measured against the ask, not the mid: you cross the
        spread to get in, so an edge that only exists at the mid isn't real.
        """
        if self.yes_ask is None:
            return None
        return true_probability - self.yes_ask


def _parse_market(m: dict) -> KalshiMarket:
    return KalshiMarket(
        ticker=m.get("ticker", ""),
        event_ticker=m.get("event_ticker", ""),
        title=m.get("title", ""),
        status=m.get("status", ""),
        yes_bid=_f(m.get("yes_bid_dollars")),
        yes_ask=_f(m.get("yes_ask_dollars")),
        last_price=_f(m.get("last_price_dollars")),
        close_time=m.get("close_time"),
        liquidity=_f(m.get("liquidity_dollars")),
        volume=_f(m.get("volume_fp")),
        strike_type=m.get("strike_type"),
        floor_strike=_f(m.get("floor_strike")),
        cap_strike=_f(m.get("cap_strike")),
        open_interest=_f(m.get("open_interest_fp")),
    )


def fetch_markets(series_ticker: Optional[str] = None, status: str = "open",
                  limit: int = 100, timeout: float = 20.0) -> list[KalshiMarket]:
    """Public market data — no credentials needed. Raises on any failure
    rather than returning partial/empty data that could look like 'no edge'."""
    import httpx

    params = {"status": status, "limit": limit}
    if series_ticker:
        params["series_ticker"] = series_ticker
    try:
        r = httpx.get(f"{BASE_URL}/markets", params=params, timeout=timeout)
        r.raise_for_status()
        payload = r.json()
    except Exception as e:
        raise KalshiUnavailableError(f"Kalshi fetch failed: {e}") from e
    if "markets" not in payload:
        raise KalshiUnavailableError(
            f"Unexpected Kalshi response shape: {list(payload)[:5]}"
        )
    return [_parse_market(m) for m in payload["markets"]]


def fetch_market(ticker: str, timeout: float = 20.0) -> KalshiMarket:
    import httpx

    try:
        r = httpx.get(f"{BASE_URL}/markets/{ticker}", timeout=timeout)
        r.raise_for_status()
        payload = r.json()
    except Exception as e:
        raise KalshiUnavailableError(f"Kalshi fetch failed for {ticker}: {e}") from e
    m = payload.get("market")
    if not m:
        raise KalshiUnavailableError(f"No market returned for {ticker}")
    return _parse_market(m)


def hours_to_close(market: KalshiMarket) -> Optional[float]:
    """Hours until the contract closes — thin near-expiry markets behave very
    differently, so callers can filter on it."""
    if not market.close_time:
        return None
    try:
        close = datetime.fromisoformat(market.close_time.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (close - datetime.now(timezone.utc)).total_seconds() / 3600.0


def fetch_settled_values(series_ticker: str, max_pages: int = 4,
                         timeout: float = 30.0) -> dict[str, float]:
    """Official settlement values per event date, keyed by the ticker's date
    segment (e.g. '26JUL20' -> 84.0).

    `expiration_value` is the number Kalshi actually paid out on — for weather
    that is the NWS Climatological Report reading itself, not a proxy for it.
    That makes it the correct ground truth for calibrating a forecast, which is
    why this exists rather than reaching for a separate observations feed.
    """
    import httpx

    out: dict[str, float] = {}
    cursor = None
    for _ in range(max_pages):
        params = {"series_ticker": series_ticker, "status": "settled", "limit": 200}
        if cursor:
            params["cursor"] = cursor
        try:
            r = httpx.get(f"{BASE_URL}/markets", params=params, timeout=timeout)
            r.raise_for_status()
            payload = r.json()
        except Exception as e:
            raise KalshiUnavailableError(
                f"Kalshi settled fetch failed for {series_ticker}: {e}") from e
        for m in payload.get("markets", []):
            value = _f(m.get("expiration_value"))
            parts = str(m.get("ticker", "")).split("-")
            if value is not None and len(parts) >= 2:
                out[parts[1]] = value
        cursor = payload.get("cursor")
        if not cursor:
            break
    if not out:
        raise KalshiUnavailableError(
            f"No settled values found for {series_ticker}")
    return out
