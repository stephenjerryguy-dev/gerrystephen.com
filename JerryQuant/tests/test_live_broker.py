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


def test_order_flow_reviews_then_places_with_ref_id(broker, monkeypatch):
    monkeypatch.setattr(broker, "assert_armed", lambda: None)
    monkeypatch.setattr(broker, "get_account_number", lambda: "TEST123")
    calls = []

    def fake_call(name, args):
        calls.append((name, args))
        return {"alerts": [], "status": "ok"}

    monkeypatch.setattr(broker, "call_tool", fake_call)
    broker.place_order(_signal(), 0.123456, manually_approved=True)
    assert [c[0] for c in calls] == ["review_equity_order", "place_equity_order"]
    review_args, place_args = calls[0][1], calls[1][1]
    for args in (review_args, place_args):
        assert args["symbol"] == "SPY"
        assert args["side"] == "buy"
        assert args["type"] == "market"          # fractional requires market
        assert args["market_hours"] == "regular_hours"
        assert args["quantity"] == "0.123456"
    assert "ref_id" in place_args and len(place_args["ref_id"]) == 36
    assert "ref_id" not in review_args


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
