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
