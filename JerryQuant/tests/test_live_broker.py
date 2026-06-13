"""Live broker safety tests — every gate that protects a real order."""

import pytest

from core.config import load_config
from database.models import Direction, Signal, SignalType
from execution.robinhood_mcp_broker import (
    BrokerDisabled,
    OrderError,
    RobinhoodMCPBroker,
)
from risk.kill_switch import KillSwitch


def _signal(asset="SPY"):
    return Signal(
        asset=asset,
        signal_type=SignalType.ENTRY,
        direction=Direction.LONG,
        entry=100.0,
        stop=95.0,
        target=112.0,
        confidence=80,
        strategy="trend_following",
        reasons_for=["test"],
        reasons_against=[],
    )


@pytest.fixture
def broker(tmp_path, cfg):
    ks = KillSwitch(tmp_path / "HALT_TRADING.txt")
    return RobinhoodMCPBroker(cfg, ks)


def test_place_order_refuses_without_approval(broker, monkeypatch):
    monkeypatch.setattr(broker, "assert_armed", lambda: None)
    with pytest.raises(BrokerDisabled, match="approval"):
        broker.place_order(_signal(), 0.1, manually_approved=False)


def test_place_order_refuses_when_disarmed(broker):
    with pytest.raises(BrokerDisabled):
        broker.place_order(_signal(), 0.1, manually_approved=True)


def test_place_order_refuses_when_halted(broker, tmp_path):
    broker.kill_switch.engage("test halt")
    with pytest.raises(Exception):
        broker.place_order(_signal(), 0.1, manually_approved=True)


def test_crypto_is_never_live_tradable(broker, monkeypatch):
    monkeypatch.setattr(broker, "assert_armed", lambda: None)
    for asset in ("BTC", "ETH-USD", "SOL"):
        with pytest.raises(OrderError, match="not live-tradable"):
            broker.place_order(_signal(asset), 0.1, manually_approved=True)


def test_blocking_review_alert_stops_order(broker, monkeypatch):
    monkeypatch.setattr(broker, "assert_armed", lambda: None)
    monkeypatch.setattr(broker, "get_account_number", lambda: "TEST123")
    monkeypatch.setattr(
        broker, "call_tool",
        lambda name, args: {"alerts": [{"severity": "blocking",
                                        "message": "insufficient buying power"}]},
    )
    with pytest.raises(OrderError, match="insufficient buying power"):
        broker.place_order(_signal(), 0.1, manually_approved=True)


def _faker(calls, ask=100.5, bid=99.5, last=100.0):
    def fake_call(name, args):
        calls.append((name, args))
        if name == "get_equity_quotes":
            return {"results": [{"quote": {
                "ask_price": str(ask), "bid_price": str(bid),
                "last_trade_price": str(last)}}]}
        return {"alerts": [], "status": "ok"}
    return fake_call


def test_fractional_buy_reviews_quotes_then_market_order(broker, monkeypatch):
    monkeypatch.setattr(broker, "assert_armed", lambda: None)
    monkeypatch.setattr(broker, "get_account_number", lambda: "TEST123")
    calls = []
    monkeypatch.setattr(broker, "call_tool", _faker(calls))
    broker.place_order(_signal(), 0.123456, manually_approved=True)
    assert [c[0] for c in calls] == [
        "review_equity_order", "get_equity_quotes", "place_equity_order"]
    place_args = calls[-1][1]
    assert place_args["type"] == "market"        # fractional requires market
    assert place_args["quantity"] == "0.123456"
    assert place_args["market_hours"] == "regular_hours"
    assert "ref_id" in place_args and len(place_args["ref_id"]) == 36


def test_whole_share_buy_uses_marketable_limit(broker, monkeypatch):
    monkeypatch.setattr(broker, "assert_armed", lambda: None)
    monkeypatch.setattr(broker, "get_account_number", lambda: "TEST123")
    calls = []
    monkeypatch.setattr(broker, "call_tool", _faker(calls, ask=100.0))
    broker.place_order(_signal(), 2.0, manually_approved=True)
    place_args = calls[-1][1]
    assert place_args["type"] == "limit"
    assert place_args["quantity"] == "2"
    # Limit sits just above the ask (0.25% buffer) -> 100.25.
    assert place_args["limit_price"] == "100.25"


def test_buy_deviation_guard_blocks_gap_up(broker, monkeypatch):
    monkeypatch.setattr(broker, "assert_armed", lambda: None)
    monkeypatch.setattr(broker, "get_account_number", lambda: "TEST123")
    calls = []
    # ref entry is 100; quote ask 105 is +5% > 1.5% guard -> refuse.
    monkeypatch.setattr(broker, "call_tool", _faker(calls, ask=105.0))
    with pytest.raises(OrderError, match="not chasing"):
        broker.place_order(_signal(), 0.1, manually_approved=True)
    assert "place_equity_order" not in [c[0] for c in calls]


def test_sell_uses_market_for_fractional(broker, monkeypatch):
    monkeypatch.setattr(broker, "assert_armed", lambda: None)
    monkeypatch.setattr(broker, "get_account_number", lambda: "TEST123")
    calls = []
    monkeypatch.setattr(broker, "call_tool", _faker(calls))
    broker.sell_position("SPY", 0.05, manually_approved=True)
    place_args = calls[-1][1]
    assert place_args["type"] == "market"
    assert place_args["side"] == "sell"
    assert place_args["quantity"] == "0.05"


def test_sell_requires_approval_too(broker, monkeypatch):
    monkeypatch.setattr(broker, "assert_armed", lambda: None)
    with pytest.raises(BrokerDisabled, match="approval"):
        broker.sell_position("SPY", 0.1, manually_approved=False)


def test_balance_is_none_when_disarmed(broker):
    assert broker.get_balance() is None


def test_account_resolution_refuses_ambiguity(broker, monkeypatch):
    monkeypatch.setattr(
        broker, "call_tool",
        lambda name, args: {"accounts": [
            {"account_number": "A1", "agentic_allowed": True, "state": "active"},
            {"account_number": "A2", "agentic_allowed": True, "state": "active"},
        ]},
    )
    with pytest.raises(OrderError, match="exactly 1"):
        broker.get_account_number()


def test_fmt_qty_rejects_sub_precision_size(broker):
    # A size that rounds to zero at 6 dp must raise, never become "0".
    with pytest.raises(OrderError, match="rounds to zero"):
        broker._fmt_qty(0.0000004)
    assert broker._fmt_qty(0.027) == "0.027"
    assert broker._fmt_qty(1.0) == "1"


def test_live_positions_uses_quantity_not_sellable_for_holding(broker, monkeypatch):
    # A freshly bought position: held in full, but 0 settled/sellable.
    # The "0" string is truthy — a naive `a or b` would drop it. It must
    # still be reported as held (quantity), with sellable surfaced separately.
    monkeypatch.setattr(broker, "get_account_number", lambda: "A1")
    monkeypatch.setattr(broker, "call_tool", lambda n, a: {"positions": [
        {"symbol": "SPY", "type": "long", "quantity": "0.027000",
         "shares_available_for_sells": "0"},
        {"symbol": "QQQ", "type": "long", "quantity": "0.05",
         "shares_available_for_sells": "0.05"},
    ]})
    pos = broker.get_live_positions()
    assert pos["SPY"]["quantity"] == 0.027     # still recognized as held
    assert pos["SPY"]["sellable"] == 0.0       # but nothing sellable yet
    assert pos["QQQ"]["quantity"] == 0.05
    assert pos["QQQ"]["sellable"] == 0.05


def test_live_positions_skips_zero_and_short(broker, monkeypatch):
    monkeypatch.setattr(broker, "get_account_number", lambda: "A1")
    monkeypatch.setattr(broker, "call_tool", lambda n, a: {"positions": [
        {"symbol": "ZERO", "type": "empty", "quantity": "0"},
        {"symbol": "SHORT", "type": "short", "quantity": "-1"},
    ]})
    assert broker.get_live_positions() == {}


def test_account_resolution_picks_single_agentic(broker, monkeypatch):
    monkeypatch.setattr(
        broker, "call_tool",
        lambda name, args: {"accounts": [
            {"account_number": "PLAIN", "agentic_allowed": False,
             "state": "active"},
            {"account_number": "AGENTIC1", "agentic_allowed": True,
             "state": "active"},
        ]},
    )
    assert broker.get_account_number() == "AGENTIC1"
