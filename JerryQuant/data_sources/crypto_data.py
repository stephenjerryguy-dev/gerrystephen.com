"""Crypto market data.

At launch this rides on yfinance's -USD pairs (BTC-USD, ETH-USD, SOL-USD),
which keeps the system key-free. A ccxt-based connector can replace
fetch_daily later behind the same interface; the staleness limit for
crypto is tighter because the market never closes.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import pandas as pd

from core.config import Config
from data_sources import market_data


def symbol_for(asset: str, cfg: Config) -> str:
    return f"{asset.upper()}-{cfg.data.crypto_quote.upper()}"


def fetch_daily(
    asset: str, cfg: Config, end: Optional[datetime] = None
) -> pd.DataFrame:
    return market_data.fetch_daily(
        symbol_for(asset, cfg), history_days=cfg.data.history_days, end=end
    )


def check_freshness(df: pd.DataFrame, asset: str, cfg: Config) -> None:
    market_data.check_freshness(
        df, cfg.data.max_staleness_hours_crypto, symbol_for(asset, cfg)
    )
