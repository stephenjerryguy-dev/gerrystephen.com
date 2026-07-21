import pytest

from risk.binary_sizing import BinarySize, BinarySizeError, calculate_binary_size


def test_positive_edge_produces_quarter_kelly_stake():
    # Price 0.50, true prob 0.60. b = 1.0, full Kelly f* = p - q/b = 0.6 - 0.4 = 0.20.
    # Quarter Kelly => 0.05 of equity. On $1000 => $50 stake => 100 units at 0.50.
    size = calculate_binary_size(
        equity=1000, price=0.50, true_prob=0.60,
        max_position_pct=100.0, kelly_fraction=0.25,
    )
    assert size.full_kelly_fraction == pytest.approx(0.20)
    assert size.value_usd == pytest.approx(50.0)
    assert size.units == pytest.approx(100.0)
    assert size.edge == pytest.approx(0.10)
    assert size.is_tradable
    assert not size.capped_by_allocation


def test_no_edge_returns_zero_units():
    # Market price already at/above your estimate => no bet.
    size = calculate_binary_size(
        equity=1000, price=0.60, true_prob=0.55, max_position_pct=100.0
    )
    assert size.units == 0.0
    assert size.value_usd == 0.0
    assert size.dollar_risk == 0.0
    assert not size.is_tradable
    assert size.edge < 0


def test_min_edge_threshold_blocks_thin_edges():
    # 2-point edge but a 5-point minimum required => no size.
    size = calculate_binary_size(
        equity=1000, price=0.50, true_prob=0.52,
        max_position_pct=100.0, min_edge=0.05,
    )
    assert size.units == 0.0
    assert not size.is_tradable


def test_allocation_cap_bounds_a_huge_edge():
    # Large edge would want a big Kelly stake; max_position_pct caps it.
    size = calculate_binary_size(
        equity=1000, price=0.10, true_prob=0.90,
        max_position_pct=5.0, kelly_fraction=0.50,
    )
    assert size.capped_by_allocation
    assert size.value_usd == pytest.approx(50.0)  # 5% of 1000
    assert size.units == pytest.approx(500.0)      # 50 / 0.10


def test_full_premium_is_default_risk():
    # With no stop, worst case is the whole stake (contract resolves to $0).
    size = calculate_binary_size(
        equity=1000, price=0.50, true_prob=0.60, max_position_pct=100.0
    )
    assert size.dollar_risk == pytest.approx(size.value_usd)


def test_stop_reduces_dollar_risk():
    # An exit stop below entry caps worst-case loss to units*(price-stop).
    size = calculate_binary_size(
        equity=1000, price=0.50, true_prob=0.60,
        max_position_pct=100.0, stop=0.40,
    )
    # 100 units * (0.50 - 0.40) = $10 risk, far below the $50 premium.
    assert size.dollar_risk == pytest.approx(10.0)
    assert size.dollar_risk < size.value_usd


def test_invalid_price_rejected():
    for bad in (0.0, 1.0, -0.1, 1.5):
        with pytest.raises(BinarySizeError):
            calculate_binary_size(
                equity=1000, price=bad, true_prob=0.6, max_position_pct=100.0
            )


def test_invalid_stop_rejected():
    # Stop must be below the entry price.
    with pytest.raises(BinarySizeError):
        calculate_binary_size(
            equity=1000, price=0.50, true_prob=0.60,
            max_position_pct=100.0, stop=0.50,
        )


def test_nonpositive_equity_rejected():
    with pytest.raises(BinarySizeError):
        calculate_binary_size(
            equity=0, price=0.5, true_prob=0.6, max_position_pct=100.0
        )
