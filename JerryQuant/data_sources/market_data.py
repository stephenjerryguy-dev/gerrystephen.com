"""Market data via yfinance (daily bars).

Rule: if data is missing, delayed, conflicting, or unreliable, we do not
trade. fetch_daily() raises DataUnavailableError instead of returning a
partial or suspicious dataframe, and callers must treat that as a hard
"no trade" for the asset.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd

REQUIRED_COLUMNS = ["open", "high", "low", "close", "volume"]


class DataUnavailableError(Exception):
    """Data is missing, stale, or fails sanity checks. Do not trade on it."""


def fetch_daily(
    symbol: str,
    history_days: int = 400,
    end: Optional[datetime] = None,
) -> pd.DataFrame:
    """Fetch daily OHLCV for a yfinance symbol (e.g. 'SPY', 'BTC-USD')."""
    try:
        import yfinance as yf
    except ImportError as e:
        raise DataUnavailableError(f"yfinance is not installed: {e}") from e

    end = end or datetime.now(timezone.utc)
    start = end - timedelta(days=int(history_days * 1.6))  # pad for non-trading days
    try:
        raw = yf.download(
            symbol,
            start=start.date(),
            end=end.date() + timedelta(days=1),
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
    except Exception as e:
        raise DataUnavailableError(f"Download failed for {symbol}: {e}") from e

    if raw is None or raw.empty:
        raise DataUnavailableError(f"No data returned for {symbol}")

    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.get_level_values(0)
    df = raw.rename(columns=str.lower)[REQUIRED_COLUMNS].copy()
    df.index = pd.to_datetime(df.index)
    validate(df, symbol)
    return df


def validate(df: pd.DataFrame, symbol: str) -> None:
    """Sanity checks. Raises DataUnavailableError on anything suspicious."""
    if df.empty:
        raise DataUnavailableError(f"{symbol}: empty dataframe")
    for col in REQUIRED_COLUMNS:
        if col not in df.columns:
            raise DataUnavailableError(f"{symbol}: missing column {col}")
    tail = df.tail(250)
    if tail[["open", "high", "low", "close"]].isna().any().any():
        raise DataUnavailableError(f"{symbol}: NaN prices in recent data")
    if (tail["close"] <= 0).any():
        raise DataUnavailableError(f"{symbol}: non-positive close prices")
    if (tail["high"] < tail["low"]).any():
        raise DataUnavailableError(f"{symbol}: high < low — corrupt bars")
    # A >60% single-day move in our large-cap/major-crypto watchlist is far
    # more likely to be a data error than a real print.
    if tail["close"].pct_change().abs().max() > 0.6:
        raise DataUnavailableError(f"{symbol}: implausible single-day move")


def check_freshness(df: pd.DataFrame, max_age_hours: float, symbol: str) -> None:
    """Raise if the latest bar is older than allowed."""
    last = df.index[-1]
    if last.tzinfo is None:
        last = last.tz_localize(timezone.utc)
    age_hours = (datetime.now(timezone.utc) - last).total_seconds() / 3600.0
    if age_hours > max_age_hours:
        raise DataUnavailableError(
            f"{symbol}: data is stale ({age_hours:.1f}h old, limit {max_age_hours}h)"
        )
