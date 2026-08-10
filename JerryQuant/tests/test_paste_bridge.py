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


def test_small_adverse_move_is_NOT_treated_as_a_failed_thesis(monkeypatch):
    """Regression on my own bad guard. A 0.75% threshold built from one
    pre-market reading went 0-for-7 that afternoon — AMD at -1.10% closed
    +2.49%. Small negative readings are pre-market noise in thin synthetic
    perps, not evidence, so they must not veto a copy."""
    _budget(monkeypatch)
    monkeypatch.delenv("JERRYQUANT_COPY_MAX_ADVERSE_PCT", raising=False)
    broker = FakeBroker({"AMD": {"tradeable": True, "fractional": True}})
    t = T("robinhood", "AMD", "LONG", 533.34)
    t.source_progress_pct = -1.10
    assert len(paste_bridge.build_actions([t], broker, 500).actions) == 1


def test_badly_broken_thesis_is_still_dropped(monkeypatch):
    _budget(monkeypatch)
    monkeypatch.delenv("JERRYQUANT_COPY_MAX_ADVERSE_PCT", raising=False)
    broker = FakeBroker({"AMD": {"tradeable": True, "fractional": True}})
    t = T("robinhood", "AMD", "LONG", 533.34)
    t.source_progress_pct = -8.0
    r = paste_bridge.build_actions([t], broker, 500)
    assert r.actions == []
    assert any("underwater" in n for n in r.notes)


def test_keeps_copy_that_is_working(monkeypatch):
    _budget(monkeypatch)
    broker = FakeBroker({"DELL": {"tradeable": True, "fractional": True}})
    t = T("robinhood", "DELL", "LONG", 419.88)
    t.source_progress_pct = +0.42
    r = paste_bridge.build_actions([t], broker, 500)
    assert len(r.actions) == 1
    assert r.actions[0]["source_progress_pct"] == pytest.approx(0.42)
    assert "+0.42% since entry" in r.actions[0]["reason"]


def test_adverse_limit_is_configurable(monkeypatch):
    _budget(monkeypatch)
    monkeypatch.setenv("JERRYQUANT_COPY_MAX_ADVERSE_PCT", "5")
    broker = FakeBroker({"AMD": {"tradeable": True, "fractional": True}})
    t = T("robinhood", "AMD", "LONG", 533.34)
    t.source_progress_pct = -1.10
    assert len(paste_bridge.build_actions([t], broker, 500).actions) == 1


# --- managing copies we already hold ------------------------------------

class _Src:
    def __init__(self, trade_id="t1", symbol="AMD", direction="LONG",
                 current_pnl=0.0, peak_pct=None, current_price=100.0):
        self.trade_id, self.symbol, self.direction = trade_id, symbol, direction
        self.current_pnl, self.peak_pct = current_pnl, peak_pct
        self.current_price = current_price


_MANAGED = {"AMD": {"strategy": "paste_copy", "source_trade_id": "t1",
                    "entry_price": 100.0}}
_HELD = {"AMD": {"quantity": 0.02, "sellable": 0.02}}


def test_absence_from_board_never_triggers_an_exit():
    """The feed is a same-day rolling window with no close flag, so a name
    dropping off means it aged out — not that the author closed. Exiting on
    absence would liquidate healthy positions every morning."""
    r = paste_bridge.exit_actions(_MANAGED, _HELD, [])
    assert r.actions == []
    assert any("absence is not a close" in n for n in r.notes)


def test_exits_when_source_thesis_is_failing(monkeypatch):
    monkeypatch.delenv("JERRYQUANT_COPY_EXIT_ADVERSE_PCT", raising=False)
    r = paste_bridge.exit_actions(_MANAGED, _HELD, [_Src(current_pnl=-2.5)])
    assert len(r.actions) == 1
    assert r.actions[0]["kind"] == "exit" and r.actions[0]["full"] is True
    assert r.actions[0]["units"] == 0.02          # only the settled quantity
    assert "thesis failing" in r.actions[0]["reason"]


def test_exits_on_give_back_from_peak():
    """BOT peaked +2.36% and sat at +0.40% — still green, but 83% handed back."""
    r = paste_bridge.exit_actions(
        _MANAGED, _HELD, [_Src(current_pnl=0.40, peak_pct=2.36)])
    assert len(r.actions) == 1
    assert "gave back" in r.actions[0]["reason"]


def test_small_peak_does_not_trigger_give_back():
    """Noise around a trivial peak must not be read as deterioration."""
    r = paste_bridge.exit_actions(
        _MANAGED, _HELD, [_Src(current_pnl=0.05, peak_pct=0.3)])
    assert r.actions == []


def test_healthy_copy_is_left_alone():
    r = paste_bridge.exit_actions(
        _MANAGED, _HELD, [_Src(current_pnl=1.8, peak_pct=2.0)])
    assert r.actions == []


def test_unsettled_position_is_not_sold():
    """T+1: proposing a sell of unsettled stock would just fail at the broker."""
    held = {"AMD": {"quantity": 0.02, "sellable": 0.0}}
    r = paste_bridge.exit_actions(_MANAGED, held, [_Src(current_pnl=-5.0)])
    assert r.actions == []


def test_only_manages_copy_positions():
    managed = {"QQQ": {"strategy": "rotation", "source_trade_id": None}}
    held = {"QQQ": {"quantity": 1.0, "sellable": 1.0}}
    r = paste_bridge.exit_actions(managed, held, [_Src(symbol="QQQ", current_pnl=-9.0)])
    assert r.actions == [] and r.notes == []


def test_single_candidate_cannot_take_the_whole_budget(monkeypatch):
    """A thin board must deploy LESS, not concentrate the sleeve into one name."""
    _budget(monkeypatch, budget="80", max_loss="100", stop="8")
    monkeypatch.delenv("JERRYQUANT_COPY_MAX_PER_NAME_PCT", raising=False)
    broker = FakeBroker({"ORCL": {"tradeable": True, "fractional": True}})
    r = paste_bridge.build_actions([T("robinhood", "ORCL", "LONG", 100.0)], broker, 500)
    stake = r.actions[0]["units"] * r.actions[0]["entry"]
    assert stake == pytest.approx(20.0)          # 25% cap, not the full $80
    assert any("left as cash" in n for n in r.notes)


def test_budget_spreads_across_several_names(monkeypatch):
    _budget(monkeypatch, budget="80", max_loss="100", stop="8")
    syms = ["ORCL", "NOK", "LDO", "PLTR"]
    broker = FakeBroker({s: {"tradeable": True, "fractional": True} for s in syms})
    tickets = [T("robinhood", s, "LONG", 100.0) for s in syms]
    r = paste_bridge.build_actions(tickets, broker, 500)
    assert len(r.actions) == 4
    stakes = [a["units"] * a["entry"] for a in r.actions]
    assert all(s == pytest.approx(20.0) for s in stakes)   # evenly spread
    assert sum(stakes) == pytest.approx(80.0)              # fully deployed


def test_budget_is_trimmed_to_available_buying_power(monkeypatch):
    """Proceeds settle T+1, so a budget sized off equity would queue a basket
    of orders against cash that does not exist yet and bounce every one."""
    _budget(monkeypatch, budget="80", max_loss="100", stop="8")
    broker = FakeBroker({"ORCL": {"tradeable": True, "fractional": True}})
    r = paste_bridge.build_actions([T("robinhood", "ORCL", "LONG", 100.0)],
                                   broker, 500, buying_power=40.0)
    stake = r.actions[0]["units"] * r.actions[0]["entry"]
    assert stake == pytest.approx(10.0)      # 25% of the TRIMMED $40 budget
    assert any("trimmed" in n for n in r.notes)


def test_no_orders_when_buying_power_is_exhausted(monkeypatch):
    _budget(monkeypatch, budget="80", max_loss="100", stop="8")
    broker = FakeBroker({"ORCL": {"tradeable": True, "fractional": True}})
    r = paste_bridge.build_actions([T("robinhood", "ORCL", "LONG", 100.0)],
                                   broker, 500, buying_power=0.50)
    assert r.actions == []
    assert any("no copy orders placed" in n for n in r.notes)


# --- ticker collision -----------------------------------------------------

def test_rejects_ticker_collision(monkeypatch):
    """paste.trade's WTI is crude oil (~$77); the listed WTI is W&T Offshore
    (~$3.43). Same string, different instrument. Sizing off the source price
    would buy a small-cap oil company believing it was crude."""
    _budget(monkeypatch, budget="30", max_loss="10", stop="8")
    broker = FakeBroker({"WTI": {"tradeable": True, "fractional": True}})
    r = paste_bridge.build_actions([T("robinhood", "WTI", "LONG", 77.31)],
                                   broker, 500, price_lookup=lambda s: 3.43)
    assert r.actions == []
    assert any("different instrument sharing a ticker" in n for n in r.notes)


def test_sizes_from_the_real_quote_not_the_source(monkeypatch):
    """Even within tolerance, we buy at OUR price — that is what we own."""
    _budget(monkeypatch, budget="30", max_loss="10", stop="8")
    broker = FakeBroker({"MU": {"tradeable": True, "fractional": True}})
    r = paste_bridge.build_actions([T("robinhood", "MU", "LONG", 880.0)],
                                   broker, 500, price_lookup=lambda s: 877.57)
    assert len(r.actions) == 1
    assert r.actions[0]["entry"] == pytest.approx(877.57)
    assert r.actions[0]["stop"] == pytest.approx(877.57 * 0.92)


def test_unpriceable_symbol_is_skipped(monkeypatch):
    """Without an independent quote the mapping cannot be verified at all."""
    _budget(monkeypatch, budget="30", max_loss="10", stop="8")
    broker = FakeBroker({"LYTE": {"tradeable": True, "fractional": True}})
    r = paste_bridge.build_actions([T("robinhood", "LYTE", "LONG", 27.47)],
                                   broker, 500,
                                   price_lookup=lambda s: (_ for _ in ()).throw(RuntimeError("no data")))
    assert r.actions == []
    assert any("cannot verify the ticker" in n for n in r.notes)
