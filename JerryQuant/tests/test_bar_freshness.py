"""Tests for market-hours bar ageing."""

from datetime import datetime, timezone

import pandas as pd
import pytest

from data_sources.market_data import bar_age_hours


def _bar(iso):
    return pd.Timestamp(iso)


def test_midnight_stamped_bar_ages_from_the_session_close():
    """Regression: Tuesday's complete bar read as 32.7h old on Wednesday
    morning because age ran from its midnight stamp, so every pre-open scan
    refused to trade on data that was in fact current."""
    now = datetime(2026, 7, 22, 8, 40, tzinfo=timezone.utc)   # Wed pre-open
    assert bar_age_hours(_bar("2026-07-21"), now) == pytest.approx(12.67, abs=0.1)


def test_weekend_does_not_count_as_staleness():
    """Friday's bar is the newest data that CAN exist on Monday morning."""
    now = datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc)   # Monday
    assert bar_age_hours(_bar("2026-07-17"), now) == pytest.approx(16.0, abs=0.1)


def test_genuinely_old_data_is_still_old():
    now = datetime(2026, 7, 22, 12, 0, tzinfo=timezone.utc)
    assert bar_age_hours(_bar("2026-07-15"), now) > 100.0


def test_future_or_same_session_bar_is_zero():
    now = datetime(2026, 7, 22, 12, 0, tzinfo=timezone.utc)
    assert bar_age_hours(_bar("2026-07-22"), now) == 0.0


def test_intraday_timestamp_is_not_shifted():
    """Only midnight-stamped daily bars get the session-close anchor."""
    now = datetime(2026, 7, 22, 18, 0, tzinfo=timezone.utc)
    bar = pd.Timestamp("2026-07-22 14:30", tz="UTC")
    assert bar_age_hours(bar, now) == pytest.approx(3.5, abs=0.01)
