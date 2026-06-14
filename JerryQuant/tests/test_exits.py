"""Exit-management tests: trailing stop, time stop, scale-out."""

import numpy as np
import pandas as pd

from strategies import trend_following
from tests.conftest import make_config, uptrend_df


def test_trailing_stop_ratchets_up_only():
    cfg = make_config()
    df = trend_following.compute_indicators(uptrend_df(300), cfg)
    current = float(df["close"].iloc[-1]) * 0.5  # a low starting stop
    new_stop = trend_following.compute_trailing_stop(df, cfg, current)
    assert new_stop > current                      # ratcheted up
    assert new_stop < float(df["close"].iloc[-1])  # still below price
    # A stop already above the chandelier never loosens.
    high_stop = float(df["close"].iloc[-1]) * 0.999
    assert trend_following.compute_trailing_stop(df, cfg, high_stop) == high_stop


def test_trailing_stop_disabled_is_noop():
    cfg = make_config(strategy={"trend_following": {"use_trailing_stop": False}})
    df = trend_following.compute_indicators(uptrend_df(300), cfg)
    assert trend_following.compute_trailing_stop(df, cfg, 1.23) == 1.23


def test_time_stop_fires_on_stale_flat_position():
    cfg = make_config(strategy={"trend_following": {
        "max_holding_days": 30, "time_stop_min_gain_pct": 5.0}})
    # Held 40 bars, only +1% -> below the 5% threshold -> exit.
    reason = trend_following.time_stop_reason(40, 100.0, 101.0, cfg)
    assert reason and "Time stop" in reason


def test_time_stop_lets_winners_run():
    cfg = make_config(strategy={"trend_following": {
        "max_holding_days": 30, "time_stop_min_gain_pct": 5.0}})
    # Held 40 bars but +20% -> a winner, no time-stop exit.
    assert trend_following.time_stop_reason(40, 100.0, 120.0, cfg) is None


def test_time_stop_disabled():
    cfg = make_config(strategy={"trend_following": {"max_holding_days": 0}})
    assert trend_following.time_stop_reason(999, 100.0, 100.0, cfg) is None


def test_scale_out_triggers_at_r_multiple():
    cfg = make_config(strategy={"trend_following": {
        "scale_out_enabled": True, "scale_out_r": 1.5, "scale_out_fraction": 0.5}})
    # entry 100, risk/unit 5 (size 2, dollar_risk 10) -> 1.5R = 107.5.
    units = trend_following.scale_out_units(100.0, 2.0, 10.0, 108.0, cfg, False)
    assert units == 1.0                              # half of 2 units
    # Below the trigger: no scale-out.
    assert trend_following.scale_out_units(100.0, 2.0, 10.0, 106.0, cfg, False) == 0.0


def test_scale_out_only_once():
    cfg = make_config(strategy={"trend_following": {"scale_out_enabled": True}})
    assert trend_following.scale_out_units(
        100.0, 2.0, 10.0, 200.0, cfg, already_scaled=True) == 0.0


def test_scale_out_disabled():
    cfg = make_config(strategy={"trend_following": {"scale_out_enabled": False}})
    assert trend_following.scale_out_units(100.0, 2.0, 10.0, 200.0, cfg, False) == 0.0
