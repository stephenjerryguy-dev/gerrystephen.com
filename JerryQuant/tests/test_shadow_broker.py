"""Tests for shadow autonomy — the unattended dry run."""

from datetime import datetime, timezone

import pytest

from execution import shadow_broker as sb


class _Sig:
    def __init__(self, asset, strategy="rotation"):
        self.asset = asset
        self.strategy = strategy


def _broker(cash=100.0, **kw):
    return sb.ShadowBroker(sb.ShadowPortfolio(cash=cash, starting_equity=cash), **kw)


# --- the two properties that make unattended running safe ---------------

def test_orders_are_queued_never_filled_at_decision_price():
    """No look-ahead: a decision made pre-open must not fill at pre-open price."""
    b = _broker()
    b.place_order(_Sig("QQQ"), 0.1, manually_approved=True)
    assert b.portfolio.fills == []            # nothing filled yet
    assert len(b.portfolio.pending) == 1
    assert b.portfolio.cash == 100.0          # and no cash moved


def test_broker_has_no_venue_path():
    """Autonomy is safe here because the venue is absent, not flag-gated."""
    import inspect
    source = inspect.getsource(sb)
    for forbidden in ("httpx", "requests", "urlopen", "api_key", "access_token"):
        assert forbidden not in source


def test_tradability_refuses_to_guess_without_a_reference():
    b = _broker()
    with pytest.raises(RuntimeError):
        b.get_tradability(["MU"])


# --- fills ---------------------------------------------------------------

def test_buy_fills_at_open_with_adverse_slippage():
    b = _broker(cash=100.0)
    b.place_order(_Sig("QQQ"), 0.1, manually_approved=True)
    filled, _ = b.fill_pending({"QQQ": 700.0})
    assert len(filled) == 1
    assert filled[0].price > 700.0            # buyer pays up, never the mid
    assert b.portfolio.cash == pytest.approx(100.0 - filled[0].price * 0.1)
    assert b.portfolio.units_of("QQQ") == pytest.approx(0.1)


def test_sell_fills_below_open():
    b = _broker(cash=0.0)
    b.portfolio.positions["QQQ"] = {"units": 0.1, "avg_price": 700.0}
    b.sell_position("QQQ", 0.1, manually_approved=True)
    filled, _ = b.fill_pending({"QQQ": 700.0})
    assert filled[0].price < 700.0            # seller gets hit
    assert "QQQ" not in b.portfolio.positions


def test_unpriced_order_stays_pending_rather_than_guessing():
    b = _broker()
    b.place_order(_Sig("QQQ"), 0.1, manually_approved=True)
    filled, notes = b.fill_pending({})
    assert filled == [] and len(b.portfolio.pending) == 1
    assert any("still pending" in n for n in notes)


def test_cannot_spend_more_cash_than_it_has():
    """The shadow must feel the same budget constraint as the real account."""
    b = _broker(cash=10.0)
    b.place_order(_Sig("QQQ"), 1.0, manually_approved=True)   # ~$700 of stock
    filled, notes = b.fill_pending({"QQQ": 700.0})
    assert b.portfolio.cash == pytest.approx(0.0)
    assert filled[0].units < 1.0
    assert any("only $" in n for n in notes)
    assert b.portfolio.cash >= 0.0            # never goes negative


def test_sell_of_unheld_symbol_is_dropped():
    b = _broker()
    b.sell_position("SPY", 1.0, manually_approved=True)
    filled, notes = b.fill_pending({"SPY": 700.0})
    assert filled == [] and any("nothing held" in n for n in notes)


# --- account shape mirrors the real broker ------------------------------

def test_positions_apply_t_plus_one_settlement():
    """A strategy that only works with instantly-reusable proceeds is not one
    you can run for real, so the shadow enforces the same T+1 rule."""
    b = _broker()
    today = datetime.now(timezone.utc).date().isoformat()
    b.portfolio.positions["QQQ"] = {"units": 1.0, "avg_price": 700.0,
                                    "last_buy_date": today}
    assert b.get_live_positions()["QQQ"]["sellable"] == 0.0
    b.portfolio.positions["QQQ"]["last_buy_date"] = "2020-01-01"
    assert b.get_live_positions()["QQQ"]["sellable"] == 1.0


def test_equity_holds_unpriced_positions_at_cost():
    p = sb.ShadowPortfolio(cash=10.0)
    p.positions["QQQ"] = {"units": 0.1, "avg_price": 700.0}
    assert p.equity({}) == pytest.approx(80.0)      # not silently zeroed
    assert p.equity({"QQQ": 800.0}) == pytest.approx(90.0)


def test_average_price_blends_across_buys():
    b = _broker(cash=1000.0, slippage_bps=0.0)
    b.place_order(_Sig("QQQ"), 1.0, manually_approved=True)
    b.fill_pending({"QQQ": 100.0})
    b.place_order(_Sig("QQQ"), 1.0, manually_approved=True)
    b.fill_pending({"QQQ": 200.0})
    assert b.portfolio.units_of("QQQ") == pytest.approx(2.0)
    assert b.portfolio.positions["QQQ"]["avg_price"] == pytest.approx(150.0)
