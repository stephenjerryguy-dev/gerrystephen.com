"""Tests for the paste.trade -> Robinhood copy bridge."""

from dataclasses import dataclass
from typing import Optional

import pytest

from strategies import paste_bridge


@dataclass
class T:  # stand-in for RoutedTicket
    venue: str
    symbol: str
    direction: str
    entry_reference: Optional[float] = 100.0
    source_handle: str = "someone"
    source_leverage: Optional[int] = 20


class FakeBroker:
    def __init__(self, trad=None, boom=False):
        self._trad = trad or {}
        self._boom = boom
        self.asked = None
    def get_tradability(self, symbols):
        if self._boom:
            raise RuntimeError("mcp down")
        self.asked = symbols
        return self._trad


def _budget(monkeypatch, budget="100", max_loss="10", stop="8"):
    monkeypatch.setenv("JERRYQUANT_RH_COPY_BUDGET_USD", budget)
    monkeypatch.setenv("JERRYQUANT_COPY_MAX_LOSS_USD", max_loss)
    monkeypatch.setenv("JERRYQUANT_COPY_STOP_PCT", stop)


def test_idle_without_budget(monkeypatch):
    monkeypatch.delenv("JERRYQUANT_RH_COPY_BUDGET_USD", raising=False)
    monkeypatch.delenv("JERRYQUANT_COPY_MAX_LOSS_USD", raising=False)
    r = paste_bridge.build_actions([T("robinhood", "MU", "LONG")], FakeBroker(), 100)
    assert r.actions == []
    assert any("idle" in n for n in r.notes)


def test_drops_shorts_and_crypto_perps(monkeypatch):
    _budget(monkeypatch)
    tickets = [T("hyperliquid", "BTC", "LONG"), T("robinhood", "SPCX", "SHORT")]
    r = paste_bridge.build_actions(tickets, FakeBroker(), 100)
    assert r.actions == []
    assert any("not long-equity-at-Robinhood" in n for n in r.notes)


def test_requires_tradable_symbol(monkeypatch):
    """paste.trade names arbitrary tickers — never assume they're tradable."""
    _budget(monkeypatch)
    broker = FakeBroker({"KIOXIA": {"tradeable": False, "fractional": False}})
    r = paste_bridge.build_actions([T("robinhood", "KIOXIA", "LONG")], broker, 100)
    assert r.actions == []
    assert any("not tradable" in n for n in r.notes)


def test_requires_fractionable(monkeypatch):
    _budget(monkeypatch)
    broker = FakeBroker({"MU": {"tradeable": True, "fractional": False}})
    r = paste_bridge.build_actions([T("robinhood", "MU", "LONG")], broker, 100)
    assert r.actions == []
    assert any("fractionable" in n for n in r.notes)


def test_tradability_failure_skips_rather_than_assumes(monkeypatch):
    _budget(monkeypatch)
    r = paste_bridge.build_actions([T("robinhood", "MU", "LONG")],
                                   FakeBroker(boom=True), 100)
    assert r.actions == []
    assert any("skipping sleeve" in n for n in r.notes)


def test_builds_capped_long_ticket(monkeypatch):
    _budget(monkeypatch, budget="100", max_loss="10", stop="8")
    broker = FakeBroker({"MU": {"tradeable": True, "fractional": True}})
    r = paste_bridge.build_actions([T("robinhood", "MU", "LONG", 100.0)], broker, 500)
    assert len(r.actions) == 1
    a = r.actions[0]
    assert a["symbol"] == "MU" and a["strategy"] == "paste_copy"
    # stop is 8% below the reference price, and loss is bounded by it
    assert abs(a["stop"] - 92.0) < 1e-9
    assert a["dollar_risk"] <= 10.0 + 1e-9        # never exceeds max-loss cap
    assert a["units"] * a["entry"] <= 100.0 + 1e-9  # never exceeds the budget
    assert "1x spot" in a["reason"]                 # leverage explicitly stripped


def test_max_loss_cap_binds_before_budget(monkeypatch):
    """With a tiny max-loss the position must shrink below the budget slice."""
    _budget(monkeypatch, budget="1000", max_loss="2", stop="10")
    broker = FakeBroker({"MU": {"tradeable": True, "fractional": True}})
    r = paste_bridge.build_actions([T("robinhood", "MU", "LONG", 100.0)], broker, 500)
    a = r.actions[0]
    assert a["dollar_risk"] <= 2.0 + 1e-9
    assert a["units"] * a["entry"] < 1000.0
