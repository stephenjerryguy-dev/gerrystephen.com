import pytest

from core.config import Mode
from database.models import Direction, Signal, SignalType
from execution import order_manager
from risk.kill_switch import KillSwitch
from tests.conftest import make_config


def make_signal(confidence=85, entry=100.0, stop=95.0, target=110.0) -> Signal:
    return Signal(
        asset="SPY",
        signal_type=SignalType.ENTRY,
        direction=Direction.LONG,
        entry=entry,
        stop=stop,
        target=target,
        confidence=confidence,
        strategy="test",
        data_sources=["test"],
        reasons_for=["test reason"],
        reasons_against=[],
    )


def build(cfg, sig):
    return order_manager.build_ticket(sig, 1000.0, [], {}, cfg)


def test_ticket_contains_all_required_fields():
    cfg = make_config()
    ticket, size = build(cfg, make_signal())
    rendered = ticket.render()
    for required in [
        "Asset", "Direction", "Entry price", "Stop loss", "Take profit",
        "Position size", "Max dollar loss", "Risk/reward", "Confidence",
        "Strategy", "Data sources", "Reason to trade", "Reason NOT to",
        "Portfolio equity", "Open positions", "Total exposure",
        "Crypto exposure",
    ]:
        assert required in rendered, f"Ticket missing field: {required}"


def test_low_confidence_blocked():
    cfg = make_config()
    with pytest.raises(order_manager.TradeBlocked):
        build(cfg, make_signal(confidence=60))


def test_poor_risk_reward_blocked():
    cfg = make_config()
    with pytest.raises(order_manager.TradeBlocked):
        build(cfg, make_signal(target=104.0))  # RR < 2:1


def test_missing_stop_blocked():
    cfg = make_config()
    sig = make_signal()
    sig.stop = None
    with pytest.raises(order_manager.TradeBlocked):
        build(cfg, sig)


def test_approval_requires_exact_word():
    cfg = make_config()
    ticket, _ = build(cfg, make_signal())
    outputs = []
    assert order_manager.request_manual_approval(
        ticket, input_fn=lambda _: "APPROVE", output_fn=outputs.append
    )
    for answer in ["yes", "approve", "APPROVED", "y", ""]:
        assert not order_manager.request_manual_approval(
            ticket, input_fn=lambda _, a=answer: a, output_fn=outputs.append
        )


def test_live_review_never_executes(tmp_path):
    cfg = make_config(mode="LIVE_REVIEW")
    ticket, _ = build(cfg, make_signal())
    executed = []
    outcome = order_manager.handle_live_signal(
        ticket, cfg, KillSwitch(tmp_path / "halt.txt"),
        execute_fn=lambda t: executed.append(t),
        input_fn=lambda _: "APPROVE",
        output_fn=lambda _: None,
    )
    assert outcome == "reviewed"
    assert executed == []


def test_live_approved_blocked_without_config_flag(tmp_path):
    cfg = make_config(mode="LIVE_APPROVED")  # live_trading_enabled stays false
    assert cfg.mode == Mode.LIVE_APPROVED
    ticket, _ = build(cfg, make_signal())
    executed = []
    outcome = order_manager.handle_live_signal(
        ticket, cfg, KillSwitch(tmp_path / "halt.txt"),
        execute_fn=lambda t: executed.append(t),
        input_fn=lambda _: "APPROVE",
        output_fn=lambda _: None,
    )
    assert "blocked" in outcome
    assert executed == []


def test_live_approved_executes_only_with_approval(tmp_path):
    cfg = make_config(
        mode="LIVE_APPROVED", execution={"live_trading_enabled": True}
    )
    ticket, _ = build(cfg, make_signal())
    executed = []
    outcome = order_manager.handle_live_signal(
        ticket, cfg, KillSwitch(tmp_path / "halt.txt"),
        execute_fn=lambda t: executed.append(t),
        input_fn=lambda _: "no",
        output_fn=lambda _: None,
    )
    assert outcome == "rejected by user"
    assert executed == []

    outcome = order_manager.handle_live_signal(
        ticket, cfg, KillSwitch(tmp_path / "halt.txt"),
        execute_fn=lambda t: executed.append(t),
        input_fn=lambda _: "APPROVE",
        output_fn=lambda _: None,
    )
    assert outcome == "executed"
    assert len(executed) == 1


def test_exposure_limits_block_fourth_position():
    cfg = make_config()
    from database.models import Position
    from datetime import datetime, timezone

    open_positions = [
        Position(
            asset=a, direction=Direction.LONG, size=1.0, entry_price=50.0,
            stop=45.0, target=60.0, opened_at=datetime.now(timezone.utc),
            strategy="test", dollar_risk=5.0,
        )
        for a in ["BTC", "ETH", "QQQ"]
    ]
    prices = {"BTC": 50.0, "ETH": 50.0, "QQQ": 50.0}
    with pytest.raises(order_manager.TradeBlocked):
        order_manager.build_ticket(make_signal(), 1000.0, open_positions, prices, cfg)
