from datetime import date

from risk.drawdown_guard import DrawdownGuard


def make_guard(equity: float = 1000.0) -> DrawdownGuard:
    return DrawdownGuard(
        max_daily_pct=5.0,
        max_total_pct=10.0,
        max_monthly_pct=3.0,
        starting_equity=equity,
    )


def test_no_breach_on_small_loss():
    guard = make_guard()
    breaches = guard.update(990, date(2026, 6, 1))
    assert breaches == []


def test_daily_breach():
    guard = make_guard()
    guard.update(1000, date(2026, 6, 1))
    breaches = guard.update(940, date(2026, 6, 1))  # -6% intraday
    assert any(b.kind == "daily" for b in breaches)


def test_daily_resets_next_day():
    guard = make_guard()
    guard.update(960, date(2026, 6, 1))  # -4%: no daily breach
    breaches = guard.update(930, date(2026, 6, 2))  # -3.1% from new day start
    assert not any(b.kind == "daily" for b in breaches)


def test_monthly_breach():
    guard = make_guard()
    guard.update(1000, date(2026, 6, 1))
    guard.update(990, date(2026, 6, 10))
    breaches = guard.update(965, date(2026, 6, 20))  # -3.5% on the month
    assert any(b.kind == "monthly" for b in breaches)


def test_monthly_resets_new_month():
    guard = make_guard()
    guard.update(980, date(2026, 6, 30))
    breaches = guard.update(960, date(2026, 7, 1))  # -2.04% from July start
    assert not any(b.kind == "monthly" for b in breaches)


def test_total_drawdown_from_peak():
    guard = make_guard()
    guard.update(1200, date(2026, 6, 1))  # new peak
    breaches = guard.update(1070, date(2026, 8, 1))  # -10.8% from peak
    assert any(b.kind == "total" for b in breaches)


def test_total_drawdown_not_breached_at_limit():
    guard = make_guard()
    guard.update(1000, date(2026, 6, 1))
    breaches = guard.update(900, date(2026, 8, 1))  # exactly -10%
    assert not any(b.kind == "total" for b in breaches)
