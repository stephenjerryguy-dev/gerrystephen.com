"""Guards against the churn that cost real money on 2026-07-27."""

from datetime import datetime, timezone

import pandas as pd
import pytest

from strategies import momentum_rotation
from tests.conftest import make_config


def _cfg(**over):
    c = make_config()
    return c.model_copy(update={"strategy": c.strategy.model_copy(update={
        "rotation": c.strategy.rotation.model_copy(update=over)})})


def _series(total, daily):
    idx = pd.date_range("2026-01-01", periods=100, freq="D")
    return pd.Series([100 * (1 + daily) ** i for i in range(100)], index=idx)


def test_marginal_lead_does_not_trigger_a_switch():
    """The real event: SPY led QQQ by 0.93pp and rotation liquidated the whole
    account. A sub-threshold lead must leave the incumbent alone."""
    closes = {"SPY": _series(100, 0.00060), "QQQ": _series(100, 0.00058),
              "BIL": _series(100, 0.00001)}
    d = momentum_rotation.decide_target(closes, _cfg(min_switch_edge_pct=2.0),
                                        incumbent="QQQ")
    assert d.target == "QQQ"
    assert "switch threshold" in d.reasons[0]


def test_decisive_lead_still_switches():
    closes = {"SPY": _series(100, 0.0020), "QQQ": _series(100, 0.0002),
              "BIL": _series(100, 0.00001)}
    d = momentum_rotation.decide_target(closes, _cfg(min_switch_edge_pct=2.0),
                                        incumbent="QQQ")
    assert d.target == "SPY"


def test_hysteresis_never_traps_us_in_a_falling_asset():
    """The threshold must not override the cash filter — if the incumbent is
    below cash we still step defensive, however small the gap."""
    closes = {"SPY": _series(100, -0.0010), "QQQ": _series(100, -0.0011),
              "BIL": _series(100, 0.00005)}
    d = momentum_rotation.decide_target(closes, _cfg(min_switch_edge_pct=5.0),
                                        incumbent="QQQ")
    assert d.target == "BIL" and d.risk_on is False


def test_no_incumbent_behaves_as_before():
    closes = {"SPY": _series(100, 0.00060), "QQQ": _series(100, 0.00058),
              "BIL": _series(100, 0.00001)}
    d = momentum_rotation.decide_target(closes, _cfg(), incumbent=None)
    assert d.target == "SPY"


def test_rotation_reserves_the_copy_sleeve_budget(monkeypatch):
    """Rotation deploys 95% of equity; without a reservation it consumed all
    buying power and the copy sleeve could never place a single order."""
    import main
    from risk.kill_switch import KillSwitch
    from tests.test_rotation import _FakeBroker, _FakeJournal, _patch_data, _ramp, _cfg as _rotcfg

    _patch_data(monkeypatch, {"SPY": _ramp(100, 0.001, 80),
                              "QQQ": _ramp(100, 0.004, 80),
                              "BIL": _ramp(100, 0.0, 80)})
    monkeypatch.setenv("JERRYQUANT_RH_COPY_BUDGET_USD", "20")
    actions, notes, _ = main._decide_rotation_actions(
        _rotcfg(), _FakeJournal(), KillSwitch("/tmp/_rot_reserve.txt"),
        _FakeBroker(held={}))
    buys = [a for a in actions if a["kind"] == "entry"]
    # Broker reports $100 buying power; $20 is reserved, so at most $80 deploys.
    assert buys and buys[0]["units"] * buys[0]["entry"] <= 80.0 + 1e-6
    assert any("reserving" in n for n in notes)


def test_reserve_comes_out_of_target_weight_not_just_spare_cash(monkeypatch):
    """The sleeve must be able to ACCUMULATE its budget.

    Reserving only from spare buying power was not enough: rotation still
    targeted 95% of TOTAL equity, so every scan topped the leader back up and
    re-consumed the reservation. The target must be measured against equity
    minus the ring-fenced budget.
    """
    import main
    from risk.kill_switch import KillSwitch
    from tests.test_rotation import _FakeBroker, _FakeJournal, _patch_data, _ramp, _cfg as _rotcfg

    _patch_data(monkeypatch, {"SPY": _ramp(100, 0.001, 80),
                              "QQQ": _ramp(100, 0.004, 80),
                              "BIL": _ramp(100, 0.0, 80)})
    monkeypatch.setenv("JERRYQUANT_RH_COPY_BUDGET_USD", "30")
    # Broker reports equity 100 and already holds the leader at ~$70, which is
    # under 95% of total equity but AT 95% of investable equity (100-30=70).
    px = _ramp(100, 0.004, 80).iloc[-1]
    held = {"QQQ": {"quantity": 66.5 / px, "sellable": 66.5 / px}}
    actions, notes, _ = main._decide_rotation_actions(
        _rotcfg(), _FakeJournal(), KillSwitch("/tmp/_rot_inv.txt"),
        _FakeBroker(held=held))
    buys = [a for a in actions if a["kind"] == "entry"]
    # Any top-up must respect the investable ceiling, never claw back the reserve.
    for b in buys:
        assert 66.5 + b["units"] * b["entry"] <= 70.0 + 1e-6


def _trim_cfg(**over):
    from tests.test_rotation import _cfg as _rotcfg
    c = _rotcfg()
    sl = c.strategy.copy_sleeve.model_copy(update={
        "enabled": True, "budget_usd": 30.0, "fund_by_trimming": True, **over})
    return c.model_copy(update={"strategy": c.strategy.model_copy(
        update={"copy_sleeve": sl})})


def _run_trim(monkeypatch, cfg, held_value, buying_power=0.0):
    import main
    from risk.kill_switch import KillSwitch
    from tests.test_rotation import _FakeBroker, _FakeJournal, _patch_data, _ramp

    _patch_data(monkeypatch, {"SPY": _ramp(100, 0.001, 80),
                              "QQQ": _ramp(100, 0.004, 80),
                              "BIL": _ramp(100, 0.0, 80)})
    px = _ramp(100, 0.004, 80).iloc[-1]
    qty = held_value / px

    class B(_FakeBroker):
        def get_buying_power(self): return buying_power
    b = B(held={"QQQ": {"quantity": qty, "sellable": qty}})
    return main._decide_rotation_actions(
        cfg, _FakeJournal(), KillSwitch("/tmp/_rot_trim.txt"), b)


def test_overweight_leader_is_trimmed_to_fund_the_sleeve(monkeypatch):
    """Equity 100, budget 30 -> investable 70, target 95% = 66.5. Holding 95
    of the leader with no cash means the sleeve can never be funded unless
    the excess is sold."""
    actions, notes, _ = _run_trim(monkeypatch, _trim_cfg(), held_value=95.0)
    exits = [a for a in actions if a["kind"] == "exit"]
    assert len(exits) == 1
    assert exits[0]["full"] is False              # a trim, never a liquidation
    assert "fund the paste.trade sleeve" in exits[0]["reason"]
    # Never sells more than the sleeve actually needs.
    assert exits[0]["units"] * exits[0]["reference_price"] <= 30.0 + 1e-6


def test_no_trim_once_the_float_is_funded(monkeypatch):
    """Cash already covers the reserve — selling more would be pure churn."""
    actions, _, _ = _run_trim(monkeypatch, _trim_cfg(), held_value=95.0,
                              buying_power=30.0)
    assert [a for a in actions if a["kind"] == "exit"] == []


def test_trimming_stays_off_unless_explicitly_enabled(monkeypatch):
    """Selling part of the core position must never be inherited silently."""
    actions, notes, _ = _run_trim(monkeypatch,
                                  _trim_cfg(fund_by_trimming=False),
                                  held_value=95.0)
    assert [a for a in actions if a["kind"] == "exit"] == []
    assert any("no change" in n for n in notes)
