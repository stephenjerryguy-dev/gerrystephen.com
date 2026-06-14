"""Regime-filter tests: the gate that keeps longs out of bad tapes."""

import numpy as np
import pandas as pd

from risk import regime_filter
from tests.conftest import make_config, downtrend_df, uptrend_df


def _cfg(**regime):
    base = {"strategy": {"regime": regime}} if regime else {}
    return make_config(watchlist={"crypto": [], "equities": ["SPY", "QQQ"]}, **base)


def test_healthy_market_is_risk_on():
    cfg = _cfg()
    data = {"SPY": uptrend_df(300), "QQQ": uptrend_df(300)}
    r = regime_filter.assess_regime(data, cfg)
    assert r.risk_on
    assert r.benchmark_uptrend
    assert r.breadth_pct == 100.0


def test_benchmark_downtrend_is_risk_off():
    cfg = _cfg()
    data = {"SPY": downtrend_df(300), "QQQ": downtrend_df(300)}
    r = regime_filter.assess_regime(data, cfg)
    assert not r.risk_on
    assert any("below its" in reason for reason in r.reasons)


def test_missing_configured_benchmark_is_risk_off():
    # SPY is configured but its data failed to load -> trade blind = no.
    cfg = _cfg()
    data = {"QQQ": uptrend_df(300)}
    r = regime_filter.assess_regime(data, cfg)
    assert not r.risk_on
    assert any("unavailable" in reason for reason in r.reasons)


def test_weak_breadth_is_risk_off():
    cfg = _cfg(min_breadth_pct=80.0)
    # SPY up (benchmark ok) but most of the universe is below its MA.
    data = {
        "SPY": uptrend_df(300),
        "QQQ": downtrend_df(300),
        "IWM": downtrend_df(300),
    }
    r = regime_filter.assess_regime(data, cfg)
    assert not r.risk_on
    assert any("breadth" in reason for reason in r.reasons)


def test_disabled_filter_is_always_risk_on():
    cfg = _cfg(enabled=False)
    data = {"SPY": downtrend_df(300)}
    r = regime_filter.assess_regime(data, cfg)
    assert r.risk_on


def test_benchmark_not_in_watchlist_falls_back_to_breadth():
    # Custom universe with no SPY configured: gate on breadth only.
    cfg = make_config(watchlist={"crypto": [], "equities": ["TEST"]})
    data = {"TEST": uptrend_df(300)}
    r = regime_filter.assess_regime(data, cfg)
    assert r.risk_on
    assert any("not in watchlist" in reason for reason in r.reasons)
