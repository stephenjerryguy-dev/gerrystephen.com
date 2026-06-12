import pytest

from database.models import Direction, Signal, SignalType
from execution.paper_broker import OrderRejected, PaperBroker
from risk.kill_switch import KillSwitch, TradingHalted
from tests.conftest import make_config


def make_signal(entry=100.0, stop=95.0, target=110.0, confidence=80) -> Signal:
    return Signal(
        asset="BTC",
        signal_type=SignalType.ENTRY,
        direction=Direction.LONG,
        entry=entry,
        stop=stop,
        target=target,
        confidence=confidence,
        strategy="test",
        data_sources=["test"],
    )


@pytest.fixture
def broker(tmp_path):
    cfg = make_config()
    ks = KillSwitch(tmp_path / "HALT_TRADING.txt")
    return PaperBroker(cfg, ks)


def test_open_long_applies_slippage_spread_and_fees(broker):
    pos = broker.open_long(make_signal(), size_units=2.0, market_price=100.0)
    # fill = 100 * (1 + (0.05 + 0.05/2)/100) = 100.075
    assert pos.entry_price == pytest.approx(100.075)
    cost = 2.0 * 100.075
    fee = cost * 0.001
    assert broker.cash == pytest.approx(1000.0 - cost - fee)
    # Stop re-anchored to fill, preserving the $5 risk distance.
    assert pos.stop == pytest.approx(100.075 - 5.0)


def test_close_long_realizes_pnl_with_costs(broker):
    broker.open_long(make_signal(), size_units=2.0, market_price=100.0)
    trade = broker.close_long("BTC", 110.0, "Take profit hit")
    assert trade.pnl > 0
    assert trade.fees > 0
    assert trade.exit_price < 110.0  # exit slippage works against us
    assert broker.positions == {}
    assert broker.cash > 1000.0  # profitable round trip


def test_losing_trade_books_loss(broker):
    broker.open_long(make_signal(), size_units=2.0, market_price=100.0)
    trade = broker.close_long("BTC", 95.0, "Stop loss hit")
    assert trade.pnl < 0
    assert broker.cash < 1000.0


def test_insufficient_cash_rejected(broker):
    with pytest.raises(OrderRejected):
        broker.open_long(make_signal(), size_units=20.0, market_price=100.0)


def test_duplicate_position_rejected(broker):
    broker.open_long(make_signal(), size_units=1.0, market_price=100.0)
    with pytest.raises(OrderRejected):
        broker.open_long(make_signal(), size_units=1.0, market_price=100.0)


def test_order_without_stop_rejected(broker):
    sig = make_signal()
    sig.stop = None
    with pytest.raises(OrderRejected):
        broker.open_long(sig, size_units=1.0, market_price=100.0)


def test_kill_switch_blocks_orders(tmp_path):
    cfg = make_config()
    ks = KillSwitch(tmp_path / "HALT_TRADING.txt")
    broker = PaperBroker(cfg, ks)
    ks.engage("test halt")
    with pytest.raises(TradingHalted):
        broker.open_long(make_signal(), size_units=1.0, market_price=100.0)


def test_stop_check_closes_position(broker):
    pos = broker.open_long(make_signal(), size_units=2.0, market_price=100.0)
    closed = broker.check_stops_and_targets({"BTC": pos.stop - 1.0})
    assert len(closed) == 1
    assert closed[0].exit_reason == "Stop loss hit"
    assert "BTC" not in broker.positions


def test_target_check_closes_position(broker):
    pos = broker.open_long(make_signal(), size_units=2.0, market_price=100.0)
    closed = broker.check_stops_and_targets({"BTC": pos.target + 1.0})
    assert len(closed) == 1
    assert closed[0].exit_reason == "Take profit hit"


def test_equity_marks_open_positions(broker):
    broker.open_long(make_signal(), size_units=2.0, market_price=100.0)
    equity_at_entry = broker.equity({"BTC": 100.075})
    # Equity right after entry = starting cash minus fees (no price move).
    assert equity_at_entry == pytest.approx(1000.0 - 2.0 * 100.075 * 0.001)
    assert broker.equity({"BTC": 110.0}) > equity_at_entry
