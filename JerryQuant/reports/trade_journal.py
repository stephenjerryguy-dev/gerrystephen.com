"""Trade journal.

Every signal — including AVOID decisions — and every trade goes into the
journal. The journal is the audit trail; nothing the system decides is
allowed to be invisible.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from database.db import Database
from database.models import Signal, Trade


class TradeJournal:
    def __init__(self, db: Database):
        self.db = db

    def record_signal(self, signal: Signal) -> int:
        return self.db.insert_signal(signal)

    def record_trade(self, trade: Trade, mode: str,
                     link: Optional[str] = None) -> int:
        return self.db.insert_trade(trade, mode=mode, link=link)

    def record_equity(self, equity: float, mode: str,
                      timestamp: Optional[datetime] = None) -> None:
        self.db.record_equity(timestamp or datetime.now(timezone.utc), equity, mode)

    def record_risk_event(self, event: str, detail: str = "") -> None:
        self.db.record_risk_event(datetime.now(timezone.utc), event, detail)

    # --- queries used by daily reporting ---

    def today(self) -> datetime:
        now = datetime.now(timezone.utc)
        return now.replace(hour=0, minute=0, second=0, microsecond=0)

    def signals_today(self):
        return self.db.signals_since(self.today())

    def trades_today(self):
        return self.db.trades_between(
            self.today(), self.today() + timedelta(days=1)
        )

    def risk_events_today(self):
        return self.db.risk_events_since(self.today())
