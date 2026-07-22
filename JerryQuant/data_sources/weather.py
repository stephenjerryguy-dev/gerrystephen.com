"""Ensemble temperature forecasts, calibrated against official settlements.

THE CENTRAL LESSON, because everything here exists to enforce it: the raw
model is not the truth. Open-Meteo's gridded 2m temperature at the Central
Park coordinates ran **+1.72°F warm** against the NWS Climatological Report
that Kalshi actually settles on, measured over 67 settled days (median +1.90,
stdev 1.26, warm on all but one day). That is not noise, it is a systematic
grid-vs-station bias — a city grid cell is not a thermometer in a park.

Trading the uncorrected ensemble would have looked like a fortune: the 88-89°
bin priced at $0.03 while the raw model said ~52%. Bias-corrected, the market
was right and the model was wrong. An "edge" that large against a liquid book
is nearly always your own error, and here it provably was.

So this module refuses to hand out a probability it has not calibrated. If the
bias cannot be estimated from recent settlements, callers get an exception, not
a number.
"""

from __future__ import annotations

import datetime as dt
import math
import statistics
from dataclasses import dataclass
from typing import Optional

ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble"
ARCHIVE_FORECAST_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"

# Minimum settled days required before any probability is trusted.
MIN_CALIBRATION_DAYS = 30


class WeatherUnavailableError(Exception):
    """Raised when forecasts or calibration cannot be obtained. Never
    substituted with a default — a missing forecast must not become a trade."""


@dataclass(frozen=True)
class Station:
    key: str
    name: str
    latitude: float
    longitude: float
    timezone: str
    kalshi_series: str


# Only stations whose Kalshi settlement source is known and verified.
STATIONS: dict[str, Station] = {
    "nyc": Station("nyc", "Central Park, New York", 40.7789, -73.9692,
                   "America/New_York", "KXHIGHNY"),
}


@dataclass(frozen=True)
class Calibration:
    """Measured correction from gridded model output to the settling station.

    The correction is a LINE, not a constant, because the measured error is
    temperature-dependent: +1.10°F on days forecast below 80°F versus +2.52°F
    on days forecast above 88°F. A single seasonal average therefore
    under-corrects exactly when it matters most — hot days, where the narrow
    2°-wide bins make half a degree worth real money.
    """
    bias: float          # mean error, for reporting only
    bias_intercept: float
    bias_slope: float    # °F of error per °F of forecast
    resid_std: float     # spread of the error left after the fit
    n_days: int
    start: dt.date
    end: dt.date

    def bias_at(self, forecast: float) -> float:
        """Expected model error at this forecast temperature."""
        return self.bias_intercept + self.bias_slope * forecast

    @property
    def is_usable(self) -> bool:
        return self.n_days >= MIN_CALIBRATION_DAYS and self.resid_std > 0

    def describe(self) -> str:
        return (f"bias {self.bias:+.2f}°F mean "
                f"({self.bias_intercept:+.2f}{self.bias_slope:+.3f}·T), "
                f"residual sd {self.resid_std:.2f}°F, "
                f"{self.n_days} settled days {self.start}..{self.end}")


def _get_json(url: str, params: dict, timeout: float) -> dict:
    import httpx
    try:
        r = httpx.get(url, params=params, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise WeatherUnavailableError(f"{url} failed: {e}") from e


def fetch_ensemble_members(station: Station, target: dt.date,
                           timeout: float = 40.0) -> list[float]:
    """Every ensemble member's daily max for `target`, in °F, UNCORRECTED.

    Returns the members rather than a mean: the spread is the whole point, and
    collapsing it early would throw away the distribution the strategy needs.
    """
    payload = _get_json(ENSEMBLE_URL, {
        "latitude": station.latitude, "longitude": station.longitude,
        "daily": "temperature_2m_max", "temperature_unit": "fahrenheit",
        "timezone": station.timezone, "models": "gfs025",
        "start_date": target.isoformat(), "end_date": target.isoformat(),
    }, timeout)
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    if target.isoformat() not in times:
        raise WeatherUnavailableError(
            f"{station.key}: ensemble has no forecast for {target} "
            f"(returned {times[:3]}) — too far out or unavailable")
    idx = times.index(target.isoformat())
    members = [
        vals[idx]
        for key, vals in daily.items()
        if key.startswith("temperature_2m_max")
        and isinstance(vals, list) and idx < len(vals)
        and vals[idx] is not None
    ]
    if len(members) < 5:
        raise WeatherUnavailableError(
            f"{station.key}: only {len(members)} ensemble members for {target}")
    return [float(m) for m in members]


def fetch_archived_forecasts(station: Station, start: dt.date, end: dt.date,
                             timeout: float = 40.0) -> dict[dt.date, float]:
    """What the model predicted for past days — the model half of calibration."""
    payload = _get_json(ARCHIVE_FORECAST_URL, {
        "latitude": station.latitude, "longitude": station.longitude,
        "daily": "temperature_2m_max", "temperature_unit": "fahrenheit",
        "timezone": station.timezone,
        "start_date": start.isoformat(), "end_date": end.isoformat(),
    }, timeout)
    daily = payload.get("daily") or {}
    out: dict[dt.date, float] = {}
    for iso, val in zip(daily.get("time") or [], daily.get("temperature_2m_max") or []):
        if val is not None:
            out[dt.date.fromisoformat(iso)] = float(val)
    if not out:
        raise WeatherUnavailableError(
            f"{station.key}: no archived forecasts for {start}..{end}")
    return out


def calibrate(station: Station, official: dict[dt.date, float],
              timeout: float = 40.0) -> Calibration:
    """Measure the model's error against what the market actually settled on.

    `official` maps date -> settled high (from Kalshi's expiration_value, i.e.
    the NWS Climatological Report itself — the exact number that pays out, not
    a proxy for it).
    """
    if not official:
        raise WeatherUnavailableError(
            f"{station.key}: no settled observations supplied — cannot calibrate")
    days = sorted(official)
    forecasts = fetch_archived_forecasts(station, days[0], days[-1], timeout)
    pairs = [(forecasts[d], official[d]) for d in days if d in forecasts]
    if len(pairs) < MIN_CALIBRATION_DAYS:
        raise WeatherUnavailableError(
            f"{station.key}: only {len(pairs)} paired days "
            f"(need {MIN_CALIBRATION_DAYS}) — refusing to trade uncalibrated")
    errors = [f - o for f, o in pairs]
    mean_forecast = statistics.mean([f for f, _ in pairs])
    mean_error = statistics.mean(errors)
    denominator = sum((f - mean_forecast) ** 2 for f, _ in pairs)
    slope = (
        sum((f - mean_forecast) * (e - mean_error)
            for (f, _), e in zip(pairs, errors)) / denominator
        if denominator > 0 else 0.0
    )
    intercept = mean_error - slope * mean_forecast
    residuals = [e - (intercept + slope * f) for (f, _), e in zip(pairs, errors)]
    return Calibration(
        bias=mean_error,
        bias_intercept=intercept,
        bias_slope=slope,
        # Population sd of what the fit could NOT explain. This is the honest
        # width of the forecast, and it is deliberately used to WIDEN the
        # distribution later rather than to sharpen it. The floor stops a
        # freakishly calm sample from producing overconfident bets.
        resid_std=max(statistics.pstdev(residuals), 0.5),
        n_days=len(pairs),
        start=days[0], end=days[-1],
    )


def fetch_point_forecast(station: Station, target: dt.date,
                         timeout: float = 40.0) -> float:
    """Deterministic daily max for `target` from the SAME model family the
    calibration was measured on (Open-Meteo's default best_match).

    This exists because of a second, subtler trap. The gfs025 ensemble runs on
    average 2.76°F COOLER than best_match (spread -7.9 to +1.2 over the next
    week), so a bias measured on best_match and applied to gfs025 members is
    simply the wrong correction — an error the same size as the edge it was
    meant to reveal. The archive does not serve gfs025, so the honest fix is to
    take LOCATION from the model we can actually calibrate.
    """
    payload = _get_json("https://api.open-meteo.com/v1/forecast", {
        "latitude": station.latitude, "longitude": station.longitude,
        "daily": "temperature_2m_max", "temperature_unit": "fahrenheit",
        "timezone": station.timezone,
        "start_date": target.isoformat(), "end_date": target.isoformat(),
    }, timeout)
    daily = payload.get("daily") or {}
    values = daily.get("temperature_2m_max") or []
    if not values or values[0] is None:
        raise WeatherUnavailableError(
            f"{station.key}: no point forecast for {target}")
    return float(values[0])


def calibrated_members(raw_members: list[float], point_forecast: float,
                       calibration: Calibration) -> list[float]:
    """Combine the two models honestly: location from the calibrated
    deterministic forecast, shape from the ensemble.

    Each member contributes only its ANOMALY (its deviation from the ensemble
    mean), which is what an ensemble is actually good for — describing the
    spread of plausible outcomes. The centre comes from the model whose error
    against the settling station has been measured. Mixing the two any other
    way silently imports the model-vs-model offset as if it were signal.
    """
    if not raw_members:
        raise WeatherUnavailableError("no ensemble members")
    ensemble_mean = statistics.mean(raw_members)
    # Correct at THIS forecast temperature, not by the seasonal average.
    anchor = point_forecast - calibration.bias_at(point_forecast)
    return [anchor + (m - ensemble_mean) for m in raw_members]


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def probability_within(members: list[float], calibration: Calibration,
                       lo: Optional[float], hi: Optional[float]) -> float:
    """P(settled high falls in the continuous interval [lo, hi)).

    `members` must already be calibrated (see `calibrated_members`); this only
    smears them by the residual error that de-biasing could not remove. That
    smearing is essential: the bare ensemble spread describes disagreement
    between model runs, NOT the model's error against a real thermometer, and
    treating it as such produces exactly the overconfident 3-cent bets this
    module exists to avoid.
    """
    if not calibration.is_usable:
        raise WeatherUnavailableError(
            f"calibration not usable ({calibration.describe()})")
    if not members:
        raise WeatherUnavailableError("no ensemble members")
    sigma = calibration.resid_std
    total = 0.0
    for centre in members:
        upper = 1.0 if hi is None else _normal_cdf((hi - centre) / sigma)
        lower = 0.0 if lo is None else _normal_cdf((lo - centre) / sigma)
        total += max(0.0, upper - lower)
    return total / len(members)
