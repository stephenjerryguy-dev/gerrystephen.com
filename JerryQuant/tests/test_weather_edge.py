"""Tests for the calibrated weather edge."""

import datetime as dt

import pytest

from data_sources import weather
from data_sources.kalshi import KalshiMarket
from strategies import weather_edge


def _cal(bias=0.0, resid=1.0, n=60, slope=0.0):
    return weather.Calibration(bias=bias, bias_intercept=bias, bias_slope=slope,
                               resid_std=resid, n_days=n,
                               start=dt.date(2026, 5, 15), end=dt.date(2026, 7, 20))


def _market(ticker="KXHIGHNY-26JUL22-B88.5", strike_type="between",
            floor=88.0, cap=89.0, bid=0.02, ask=0.03, oi=500.0):
    return KalshiMarket(
        ticker=ticker, event_ticker="KXHIGHNY-26JUL22", title="t",
        status="active", yes_bid=bid, yes_ask=ask, last_price=ask,
        close_time=None, liquidity=1.0, volume=100.0,
        strike_type=strike_type, floor_strike=floor, cap_strike=cap,
        open_interest=oi)


# --- integer-degree strike arithmetic ----------------------------------

def test_between_widens_to_half_degrees():
    """'88-89' is the integer event {88,89}.

    A reading rounds to 88 from [87.5, 88.5) and to 89 from [88.5, 89.5), so
    the paying interval is [87.5, 89.5) — NOT up to 90.0.
    """
    assert weather_edge.strike_interval(_market()) == (87.5, 89.5)


def test_greater_is_strict():
    """'>91' pays only at 92+, so the boundary is 91.5, not 91."""
    m = _market(strike_type="greater", floor=91.0, cap=None)
    assert weather_edge.strike_interval(m) == (91.5, None)


def test_less_is_strict():
    """'<84' pays only at 83 or below, so the boundary is 83.5."""
    m = _market(strike_type="less", floor=None, cap=84.0)
    assert weather_edge.strike_interval(m) == (None, 83.5)


def test_unknown_strike_shape_is_skipped_not_guessed():
    assert weather_edge.strike_interval(_market(strike_type="mystery")) is None


# --- calibration is mandatory ------------------------------------------

def test_probability_refuses_uncalibrated_input():
    thin = weather.Calibration(bias=1.7, bias_intercept=1.7, bias_slope=0.0,
                               resid_std=1.2, n_days=5,
                               start=dt.date(2026, 7, 1), end=dt.date(2026, 7, 5))
    with pytest.raises(weather.WeatherUnavailableError):
        weather.probability_within([87.0], thin, 87.5, 90.0)


def test_calibrate_refuses_short_history(monkeypatch):
    station = weather.STATIONS["nyc"]
    official = {dt.date(2026, 7, 1) + dt.timedelta(days=i): 80.0 for i in range(5)}
    monkeypatch.setattr(weather, "fetch_archived_forecasts",
                        lambda *a, **k: {d: 82.0 for d in official})
    with pytest.raises(weather.WeatherUnavailableError):
        weather.calibrate(station, official)


def test_calibrate_measures_bias_and_residual(monkeypatch):
    station = weather.STATIONS["nyc"]
    days = [dt.date(2026, 6, 1) + dt.timedelta(days=i) for i in range(40)]
    official = {d: 80.0 for d in days}
    monkeypatch.setattr(weather, "fetch_archived_forecasts",
                        lambda *a, **k: {d: 82.0 for d in days})
    cal = weather.calibrate(station, official)
    assert cal.bias == pytest.approx(2.0)
    assert cal.n_days == 40 and cal.is_usable


def test_calibration_fits_temperature_dependent_bias(monkeypatch):
    """Measured live: error is +1.10F on cool days but +2.52F on hot ones, so
    a flat average under-corrects exactly where the 2-degree bins bite."""
    station = weather.STATIONS["nyc"]
    days = [dt.date(2026, 6, 1) + dt.timedelta(days=i) for i in range(40)]
    # official climbs 70..90; model error grows with temperature
    official = {d: 70.0 + i * 0.5 for i, d in enumerate(days)}
    forecasts = {d: official[d] + 1.0 + 0.1 * (official[d] - 70.0)
                 for d in days}
    monkeypatch.setattr(weather, "fetch_archived_forecasts", lambda *a, **k: forecasts)
    cal = weather.calibrate(station, official)
    assert cal.bias_slope > 0.05                      # detected the dependence
    assert cal.bias_at(90.0) > cal.bias_at(72.0) + 1.0  # hot days corrected more


# --- the bias trap this module exists to prevent -----------------------

def test_bias_correction_removes_the_phantom_edge():
    """The live failure, pinned as a test.

    Members clustered near 88°F implied a big probability for the 88-89 bin
    priced at $0.03 — an apparent 50-point edge. The model was measured running
    ~1.7°F warm against the settling station. Correcting for it must collapse
    that edge, not merely shrink it.
    """
    members = [87.7, 87.8, 88.0, 88.2, 88.7, 89.0, 89.1, 88.5, 88.7, 87.9]
    point = 88.4                                            # deterministic run
    lo, hi = weather_edge.strike_interval(_market())         # 88-89 bin

    uncorrected = weather.calibrated_members(members, point, _cal(bias=0.0))
    corrected = weather.calibrated_members(members, point, _cal(bias=1.72))
    raw = weather.probability_within(uncorrected, _cal(bias=0.0, resid=1.0), lo, hi)
    fixed = weather.probability_within(corrected, _cal(bias=1.72, resid=1.26), lo, hi)

    assert raw > 0.45          # uncorrected: looks like a fortune at $0.03
    assert fixed < raw / 2     # corrected: the "edge" was our own error


def test_location_comes_from_calibrated_model_not_the_ensemble():
    """The second trap: the ensemble runs ~2.8F cooler than the model the bias
    was measured on, so members must supply SHAPE only, never the centre."""
    members = [80.0, 82.0, 84.0]        # ensemble mean 82, i.e. cold-running
    cal = _cal(bias=1.5)
    out = weather.calibrated_members(members, point_forecast=90.0, calibration=cal)
    assert sum(out) / len(out) == pytest.approx(88.5)   # 90.0 - bias, not 82
    assert max(out) - min(out) == pytest.approx(4.0)    # spread preserved


def test_residual_uncertainty_widens_rather_than_sharpens():
    """A larger residual error must never make a bet look MORE certain."""
    members = [88.0] * 10
    lo, hi = weather_edge.strike_interval(_market())
    tight = weather.probability_within(members, _cal(resid=0.5), lo, hi)
    loose = weather.probability_within(members, _cal(resid=3.0), lo, hi)
    assert tight > loose


# --- book-quality gates -------------------------------------------------

def test_wide_spread_is_skipped():
    m = _market(bid=0.10, ask=0.40)
    edges, notes = weather_edge.find_edges([m], [88.0] * 10, _cal(), min_edge=0.05)
    assert edges == [] and any("spread" in n for n in notes)


def test_thin_open_interest_is_skipped():
    m = _market(oi=5.0)
    edges, notes = weather_edge.find_edges([m], [88.0] * 10, _cal(), min_edge=0.05)
    assert edges == [] and any("too thin" in n for n in notes)


def test_edge_measured_against_ask_and_sorted():
    cheap = _market(ticker="A", bid=0.04, ask=0.05, oi=500.0)
    dear = _market(ticker="B", bid=0.30, ask=0.32, oi=500.0)
    edges, _ = weather_edge.find_edges([dear, cheap], [88.0] * 10,
                                       _cal(resid=1.0), min_edge=0.05)
    assert [e.market_ticker for e in edges] == ["A", "B"]   # best edge first
    assert edges[0].edge == pytest.approx(
        edges[0].model_probability - 0.05)                  # vs ask, not mid
