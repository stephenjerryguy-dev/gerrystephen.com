"""Drawdown monitoring.

Tracks peak equity, day-start equity, and month-start equity, and reports
breaches of the daily, monthly, and total drawdown limits. The guard only
detects; engaging the kill switch is the caller's job so that every breach
flows through one choke point (risk.kill_switch).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class DrawdownBreach:
    kind: str            # "daily" | "monthly" | "total"
    drawdown_pct: float
    limit_pct: float

    def __str__(self) -> str:
        return (
            f"{self.kind} drawdown {self.drawdown_pct:.2f}% breached "
            f"limit {self.limit_pct:.2f}%"
        )


@dataclass
class DrawdownGuard:
    max_daily_pct: float
    max_total_pct: float
    max_monthly_pct: float
    starting_equity: float

    peak_equity: float = field(init=False)
    day_start_equity: float = field(init=False)
    month_start_equity: float = field(init=False)
    current_day: Optional[date] = field(init=False, default=None)
    current_month: Optional[tuple[int, int]] = field(init=False, default=None)

    def __post_init__(self) -> None:
        self.peak_equity = self.starting_equity
        self.day_start_equity = self.starting_equity
        self.month_start_equity = self.starting_equity

    def _roll_periods(self, today: date) -> None:
        if self.current_day != today:
            self.current_day = today
            self.day_start_equity = self._last_equity
        month = (today.year, today.month)
        if self.current_month != month:
            self.current_month = month
            self.month_start_equity = self._last_equity

    _last_equity: float = field(init=False, default=0.0)

    def update(self, equity: float, today: date) -> list[DrawdownBreach]:
        """Feed the latest equity mark; returns all limits breached."""
        if self.current_day is None:
            self._last_equity = self.starting_equity
        self._roll_periods(today)
        self._last_equity = equity
        self.peak_equity = max(self.peak_equity, equity)

        breaches: list[DrawdownBreach] = []

        daily_dd = self._pct_down(self.day_start_equity, equity)
        if daily_dd > self.max_daily_pct:
            breaches.append(DrawdownBreach("daily", daily_dd, self.max_daily_pct))

        monthly_dd = self._pct_down(self.month_start_equity, equity)
        if monthly_dd > self.max_monthly_pct:
            breaches.append(
                DrawdownBreach("monthly", monthly_dd, self.max_monthly_pct)
            )

        total_dd = self._pct_down(self.peak_equity, equity)
        if total_dd > self.max_total_pct:
            breaches.append(DrawdownBreach("total", total_dd, self.max_total_pct))

        return breaches

    def total_drawdown_pct(self, equity: float) -> float:
        return self._pct_down(self.peak_equity, equity)

    @staticmethod
    def _pct_down(reference: float, equity: float) -> float:
        if reference <= 0:
            return 0.0
        return max(0.0, (reference - equity) / reference * 100.0)
