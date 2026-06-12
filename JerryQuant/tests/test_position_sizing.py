import pytest

from risk.position_sizing import PositionSizeError, calculate_position_size


def test_one_percent_risk_sizing():
    # $1000 equity, 1% risk = $10. Entry 100, stop 95 => $5/unit => 2 units.
    size = calculate_position_size(
        equity=1000, entry=100, stop=95, max_risk_pct=1.0, max_position_pct=100.0
    )
    assert size.units == pytest.approx(2.0)
    assert size.dollar_risk == pytest.approx(10.0)
    assert size.risk_pct_of_equity == pytest.approx(1.0)
    assert not size.capped_by_allocation


def test_allocation_cap_shrinks_position():
    # Uncapped: 1% of 1000 = $10 risk / $1 per unit = 10 units = $1000 value.
    # 20% allocation cap limits value to $200 => 2 units.
    size = calculate_position_size(
        equity=1000, entry=100, stop=99, max_risk_pct=1.0, max_position_pct=20.0
    )
    assert size.capped_by_allocation
    assert size.value_usd == pytest.approx(200.0)
    assert size.dollar_risk < 10.0  # capped position risks less than allowed


def test_no_stop_is_rejected():
    with pytest.raises(PositionSizeError):
        calculate_position_size(
            equity=1000, entry=100, stop=None, max_risk_pct=1.0,
            max_position_pct=20.0,
        )


def test_stop_above_entry_is_rejected():
    with pytest.raises(PositionSizeError):
        calculate_position_size(
            equity=1000, entry=100, stop=105, max_risk_pct=1.0,
            max_position_pct=20.0,
        )


def test_stop_equal_to_entry_is_rejected():
    with pytest.raises(PositionSizeError):
        calculate_position_size(
            equity=1000, entry=100, stop=100, max_risk_pct=1.0,
            max_position_pct=20.0,
        )


def test_nonpositive_equity_is_rejected():
    with pytest.raises(PositionSizeError):
        calculate_position_size(
            equity=0, entry=100, stop=95, max_risk_pct=1.0, max_position_pct=20.0
        )
    with pytest.raises(PositionSizeError):
        calculate_position_size(
            equity=-50, entry=100, stop=95, max_risk_pct=1.0, max_position_pct=20.0
        )


def test_negative_stop_is_rejected():
    with pytest.raises(PositionSizeError):
        calculate_position_size(
            equity=1000, entry=100, stop=-5, max_risk_pct=1.0, max_position_pct=20.0
        )
