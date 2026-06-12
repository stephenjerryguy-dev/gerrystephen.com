from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from core.config import Config


def make_config(**overrides) -> Config:
    base = {
        "mode": "BACKTEST",
        "account": {"starting_equity_usd": 1000.0},
        "watchlist": {"crypto": ["BTC", "ETH", "SOL"], "equities": ["SPY", "QQQ"]},
    }
    base.update(overrides)
    return Config(**base)


@pytest.fixture
def cfg() -> Config:
    return make_config()


def uptrend_df(days: int = 300, breakout_last_bar: bool = True) -> pd.DataFrame:
    """Steady uptrend; optionally ends with a high-volume breakout bar."""
    idx = pd.bdate_range("2022-01-03", periods=days)
    base = 100 * (1.002 ** np.arange(days))
    close = base.copy()
    volume = np.full(days, 1_000_000.0)
    if breakout_last_bar:
        close[-1] = close[-2] * 1.03
        volume[-1] = 2_000_000.0
    high = close * 1.01
    low = close * 0.99
    open_ = np.concatenate([[close[0]], close[:-1]])
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=idx,
    )


def downtrend_df(days: int = 300) -> pd.DataFrame:
    idx = pd.bdate_range("2022-01-03", periods=days)
    close = 100 * (0.998 ** np.arange(days))
    return pd.DataFrame(
        {
            "open": close,
            "high": close * 1.01,
            "low": close * 0.99,
            "close": close,
            "volume": np.full(days, 1_000_000.0),
        },
        index=idx,
    )


def trending_with_breakouts_df(days: int = 340) -> pd.DataFrame:
    """Uptrend with periodic breakout surges after the MA warmup, so the
    backtest engine actually takes trades."""
    idx = pd.bdate_range("2021-01-04", periods=days)
    close = np.empty(days)
    volume = np.full(days, 1_000_000.0)
    close[0] = 100.0
    for i in range(1, days):
        if i > 210 and i % 25 == 0:
            close[i] = close[i - 1] * 1.04
            volume[i] = 2_500_000.0
        else:
            close[i] = close[i - 1] * 1.0015
    high = close * 1.005
    low = close * 0.995
    open_ = np.concatenate([[close[0]], close[:-1]])
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=idx,
    )
