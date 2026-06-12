"""Stop-loss calculation tests for the trend-following strategy."""

import pandas as pd

from strategies import trend_following
from tests.conftest import make_config, uptrend_df


def test_stop_is_below_entry_and_positive():
    cfg = make_config()
    df = trend_following.compute_indicators(uptrend_df(), cfg)
    sig = trend_following.evaluate(df, "TEST", cfg)
    assert sig is not None
    assert sig.stop is not None
    assert 0 < sig.stop < sig.entry


def test_stop_uses_wider_of_atr_and_swing_low():
    cfg = make_config()
    df = trend_following.compute_indicators(uptrend_df(), cfg)
    bar = df.iloc[-1]
    sig = trend_following.evaluate(df, "TEST", cfg)
    atr_stop = sig.entry - cfg.strategy.trend_following.atr_stop_multiple * float(
        bar["atr"]
    )
    swing_low = float(bar["swing_low"])
    assert sig.stop == min(atr_stop, swing_low)


def test_target_respects_min_risk_reward():
    cfg = make_config()
    df = trend_following.compute_indicators(uptrend_df(), cfg)
    sig = trend_following.evaluate(df, "TEST", cfg)
    assert sig.target is not None
    assert sig.risk_reward >= cfg.risk.min_risk_reward


def test_unstoppable_bar_yields_no_entry():
    """If the stop computes to a non-positive price, no entry is possible."""
    cfg = make_config()
    df = uptrend_df()
    # Force a pathological swing low so the stop becomes negative.
    df.loc[df.index[-5:], "low"] = -1.0
    ind = trend_following.compute_indicators(df, cfg)
    sig = trend_following.evaluate(ind, "TEST", cfg)
    assert sig is not None
    assert sig.signal_type.value == "AVOID"
    assert sig.stop is None
    assert any("Stop loss" in r for r in sig.reasons_against)
