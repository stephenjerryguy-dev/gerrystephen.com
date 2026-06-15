"""Tests for the momentum-rotation decision logic and backtest engine."""

import numpy as np
import pandas as pd
import pytest

from backtesting import rotation_engine
from strategies import momentum_rotation
from tests.conftest import make_config


def _series(values):
    idx = pd.bdate_range("2022-01-03", periods=len(values))
    return pd.Series(values, index=idx, dtype=float)


def _ramp(start, daily, n):
    return _series([start * (1 + daily) ** i for i in range(n)])


def _cfg(**rot):
    base = {"strategy": {"rotation": {"rotation_assets": ["SPY", "QQQ"],
                                      "defensive_asset": "BIL",
                                      "lookback_days": 20, **rot}}}
    return make_config(**base)


def test_picks_strongest_asset():
    cfg = _cfg()
    closes = {
        "SPY": _ramp(100, 0.001, 60),   # +slow
        "QQQ": _ramp(100, 0.004, 60),   # +fast  <- strongest
        "BIL": _ramp(100, 0.0, 60),     # flat
    }
    d = momentum_rotation.decide_target(closes, cfg)
    assert d.target == "QQQ"
    assert d.risk_on is True


def test_cash_filter_when_whole_pool_below_cash():
    cfg = _cfg()
    closes = {
        "SPY": _ramp(100, -0.003, 60),  # falling
        "QQQ": _ramp(100, -0.001, 60),  # falling
        "BIL": _ramp(100, 0.0, 60),     # flat (cash)
    }
    d = momentum_rotation.decide_target(closes, cfg)
    assert d.target == "BIL"            # whole market down -> hold cash
    assert d.risk_on is False


def test_defensive_when_no_data():
    cfg = _cfg()
    d = momentum_rotation.decide_target({"BIL": _ramp(100, 0.0, 60)}, cfg)
    assert d.target == "BIL"
    assert d.risk_on is False


def test_trailing_momentum_none_on_short_history():
    assert momentum_rotation.trailing_momentum(_series([1, 2, 3]), 20) is None


def _df(values):
    s = _series(values)
    return pd.DataFrame({"open": s, "high": s, "low": s, "close": s,
                         "volume": [1e6] * len(s)}, index=s.index)


def test_rotation_backtest_runs_and_rotates():
    cfg = _cfg()
    n = 400
    # QQQ leads early, SPY leads late -> the engine should rotate between them.
    qqq = [100 * 1.002 ** i for i in range(200)] + [100 * 1.002 ** 200 * 0.9995 ** i for i in range(n - 200)]
    spy = [100 * 1.0005 ** i for i in range(200)] + [100 * 1.0005 ** 200 * 1.003 ** i for i in range(n - 200)]
    data = {"SPY": _df(spy), "QQQ": _df(qqq), "BIL": _df([100.0] * n)}
    r = rotation_engine.run_rotation_backtest(data, cfg)
    assert len(r.equity_curve) > 0
    assert r.num_rotations >= 1
    assert r.benchmark_symbol == "SPY"


def test_rotation_backtest_needs_history():
    cfg = _cfg(lookback_days=20)
    short = {s: _df([100.0] * 10) for s in ("SPY", "QQQ", "BIL")}
    with pytest.raises(ValueError):
        rotation_engine.run_rotation_backtest(short, cfg)


class _FakeBroker:
    def __init__(self, held=None):
        self._held = held or {}
    def get_balance(self): return 100.0
    def get_buying_power(self): return 100.0
    def get_live_positions(self): return self._held

class _FakeJournal:
    def record_equity(self, *a, **k): pass
    def record_risk_event(self, *a, **k): pass


def _patch_data(monkeypatch, series_by_sym):
    import data_sources.market_data as md
    def fake_fetch(sym, history_days=400):
        s = series_by_sym[sym]
        return pd.DataFrame({"open": s, "high": s, "low": s, "close": s,
                             "volume": [1e6]*len(s)}, index=s.index)
    monkeypatch.setattr(md, "fetch_daily", fake_fetch)
    monkeypatch.setattr(md, "check_freshness", lambda *a, **k: None)


def test_live_rotation_proposes_buy_when_flat(monkeypatch):
    import main
    from risk.kill_switch import KillSwitch
    cfg = _cfg().model_copy(update={"strategy": _cfg().strategy})
    _patch_data(monkeypatch, {
        "SPY": _ramp(100, 0.001, 80), "QQQ": _ramp(100, 0.004, 80),
        "BIL": _ramp(100, 0.0, 80)})
    actions, notes, eq = main._decide_rotation_actions(
        cfg, _FakeJournal(), KillSwitch("/tmp/_rot_halt.txt"), _FakeBroker(held={}))
    buys = [a for a in actions if a["kind"] == "entry"]
    assert len(buys) == 1 and buys[0]["symbol"] == "QQQ"
    assert buys[0]["strategy"] == "rotation"
    assert buys[0]["units"] > 0


def test_live_rotation_noop_when_already_holding_target(monkeypatch):
    import main
    from risk.kill_switch import KillSwitch
    cfg = _cfg()
    _patch_data(monkeypatch, {
        "SPY": _ramp(100, 0.001, 80), "QQQ": _ramp(100, 0.004, 80),
        "BIL": _ramp(100, 0.0, 80)})
    held = {"QQQ": {"quantity": 0.1, "sellable": 0.1}}
    actions, notes, eq = main._decide_rotation_actions(
        cfg, _FakeJournal(), KillSwitch("/tmp/_rot_halt2.txt"), _FakeBroker(held=held))
    assert actions == []   # already in the leader, nothing to do


def test_take_profit_flag_changes_behavior():
    # With a steadily rising winner, a take-profit forces an exit to cash that
    # the no-TP run never makes — so the trade counts differ.
    base = _cfg()
    tp = _cfg(use_take_profit=True, take_profit_pct=10.0)
    n = 300
    rising = [100 * 1.003 ** i for i in range(n)]
    flat = [100.0] * n
    data = {"SPY": _df(rising), "QQQ": _df(flat), "BIL": _df(flat)}
    r_base = rotation_engine.run_rotation_backtest(data, base)
    r_tp = rotation_engine.run_rotation_backtest(data, tp)
    assert r_tp.num_rotations > r_base.num_rotations
