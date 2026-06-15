"""Tests for the diversified target-allocation strategy."""

import numpy as np
import pandas as pd
import pytest

from backtesting import allocation_engine
from strategies import allocation
from tests.conftest import make_config


def _cfg(**alloc):
    base = {"SPY": 40.0, "QQQ": 20.0, "IWM": 10.0, "GLD": 15.0, "TLT": 15.0}
    weights = alloc.pop("weights", base)
    return make_config(strategy={"active": "allocation",
                                 "allocation": {"weights": weights, **alloc}})


def test_target_dollars_sum_to_investable():
    cfg = _cfg(cash_buffer_pct=2.0)
    t = allocation.target_dollars(1000.0, cfg)
    assert abs(sum(t.values()) - 980.0) < 0.01    # 2% cash buffer held back
    assert abs(t["SPY"] - 0.40 * 980.0) < 0.01


def test_initial_deploy_is_all_buys():
    cfg = _cfg()
    plan = allocation.plan_rebalance({}, 1000.0, cfg)   # all cash
    assert plan.needed
    assert all(t.side == "buy" for t in plan.trades)
    assert {t.symbol for t in plan.trades} == {"SPY", "QQQ", "IWM", "GLD", "TLT"}


def test_within_band_does_nothing():
    cfg = _cfg(rebalance_band_pct=5.0)
    # Hold exactly target weights (of 980 investable) -> no drift -> no trades.
    t = allocation.target_dollars(1000.0, cfg)
    plan = allocation.plan_rebalance(dict(t), 1000.0, cfg)
    assert not plan.needed
    assert plan.trades == []


def test_drift_past_band_triggers_rebalance():
    cfg = _cfg(rebalance_band_pct=5.0)
    t = allocation.target_dollars(1000.0, cfg)
    drifted = dict(t)
    drifted["SPY"] += 200.0   # SPY ran up well past the $50 band
    drifted["TLT"] -= 200.0
    plan = allocation.plan_rebalance(drifted, 1000.0, cfg)
    assert plan.needed
    sides = {t.symbol: t.side for t in plan.trades}
    assert sides["SPY"] == "sell"   # trim the winner
    assert sides["TLT"] == "buy"    # top up the laggard


def _df(values):
    idx = pd.bdate_range("2020-01-02", periods=len(values))
    s = pd.Series(values, index=idx, dtype=float)
    return pd.DataFrame({"open": s, "high": s, "low": s, "close": s,
                         "volume": [1e6] * len(s)}, index=idx)


def test_allocation_backtest_runs():
    cfg = _cfg()
    n = 600
    data = {
        "SPY": _df([100 * 1.0004 ** i for i in range(n)]),
        "QQQ": _df([100 * 1.0006 ** i for i in range(n)]),
        "IWM": _df([100 * 1.0002 ** i for i in range(n)]),
        "GLD": _df([100 * 1.0003 ** i for i in range(n)]),
        "TLT": _df([100 * 0.9999 ** i for i in range(n)]),
    }
    r = allocation_engine.run_allocation_backtest(data, cfg)
    assert len(r.equity_curve) > 0
    assert r.benchmark_symbol == "SPY"
    assert r.num_rebalances >= 0


def test_allocation_backtest_missing_asset_raises():
    cfg = _cfg()
    with pytest.raises(ValueError):
        allocation_engine.run_allocation_backtest({"SPY": _df([100.0] * 60)}, cfg)


def test_live_allocation_proposes_diversified_buys(monkeypatch):
    import main
    from risk.kill_switch import KillSwitch

    cfg = _cfg()
    import data_sources.market_data as md
    monkeypatch.setattr(md, "fetch_daily",
                        lambda s, history_days=400: _df([100.0] * 80))
    monkeypatch.setattr(md, "check_freshness", lambda *a, **k: None)

    class FakeBroker:
        def get_balance(self): return 1000.0
        def get_buying_power(self): return 1000.0
        def get_live_positions(self): return {}

    class FakeJournal:
        def record_equity(self, *a, **k): pass
        def record_risk_event(self, *a, **k): pass

    actions, notes, eq = main._decide_allocation_actions(
        cfg, FakeJournal(), KillSwitch("/tmp/_alloc_halt.txt"), FakeBroker())
    buys = {a["symbol"] for a in actions if a["kind"] == "entry"}
    assert buys == {"SPY", "QQQ", "IWM", "GLD", "TLT"}
    assert all(a["strategy"] == "allocation" for a in actions)
