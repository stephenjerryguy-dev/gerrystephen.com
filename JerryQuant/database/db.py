"""Thin SQLite wrapper for the trade journal and signal history."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from database.models import SCHEMA, Signal, Trade


class Database:
    def __init__(self, path: str | Path = "jerryquant.db"):
        self.path = str(path)
        self._conn = sqlite3.connect(self.path)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    # --- signals ---

    def insert_signal(self, s: Signal) -> int:
        cur = self._conn.execute(
            """INSERT INTO signals
               (timestamp, asset, signal_type, direction, entry, stop, target,
                confidence, strategy, data_sources, reasons_for, reasons_against)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                s.timestamp.isoformat(),
                s.asset,
                s.signal_type.value,
                s.direction.value,
                s.entry,
                s.stop,
                s.target,
                s.confidence,
                s.strategy,
                json.dumps(s.data_sources),
                json.dumps(s.reasons_for),
                json.dumps(s.reasons_against),
            ),
        )
        self._conn.commit()
        return int(cur.lastrowid)

    def signals_since(self, since: datetime) -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM signals WHERE timestamp >= ? ORDER BY timestamp",
            (since.isoformat(),),
        ).fetchall()

    # --- trades ---

    def insert_trade(self, t: Trade, mode: str, link: Optional[str] = None) -> int:
        cur = self._conn.execute(
            """INSERT INTO trades
               (asset, direction, size, entry_price, exit_price, stop, target,
                dollar_risk, confidence, strategy, data_sources, reasoning,
                opened_at, closed_at, exit_reason, fees, pnl, mode, link)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                t.asset,
                t.direction.value,
                t.size,
                t.entry_price,
                t.exit_price,
                t.stop,
                t.target,
                t.dollar_risk,
                t.confidence,
                t.strategy,
                json.dumps(t.data_sources),
                t.reasoning,
                t.opened_at.isoformat(),
                t.closed_at.isoformat(),
                t.exit_reason,
                t.fees,
                t.pnl,
                mode,
                link,
            ),
        )
        self._conn.commit()
        return int(cur.lastrowid)

    def trades_between(self, start: datetime, end: datetime) -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM trades WHERE closed_at >= ? AND closed_at <= ? "
            "ORDER BY closed_at",
            (start.isoformat(), end.isoformat()),
        ).fetchall()

    def all_trades(self, mode: Optional[str] = None) -> list[sqlite3.Row]:
        if mode:
            return self._conn.execute(
                "SELECT * FROM trades WHERE mode = ? ORDER BY opened_at", (mode,)
            ).fetchall()
        return self._conn.execute(
            "SELECT * FROM trades ORDER BY opened_at"
        ).fetchall()

    # --- equity / risk events ---

    def record_equity(self, timestamp: datetime, equity: float, mode: str) -> None:
        self._conn.execute(
            "INSERT INTO equity_history (timestamp, equity, mode) VALUES (?, ?, ?)",
            (timestamp.isoformat(), equity, mode),
        )
        self._conn.commit()

    def record_risk_event(self, timestamp: datetime, event: str, detail: str) -> None:
        self._conn.execute(
            "INSERT INTO risk_events (timestamp, event, detail) VALUES (?, ?, ?)",
            (timestamp.isoformat(), event, detail),
        )
        self._conn.commit()

    def risk_events_since(self, since: datetime) -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM risk_events WHERE timestamp >= ? ORDER BY timestamp",
            (since.isoformat(),),
        ).fetchall()

    def equity_history(self, mode: str) -> list[tuple[str, float]]:
        rows = self._conn.execute(
            "SELECT timestamp, equity FROM equity_history WHERE mode = ? "
            "ORDER BY timestamp",
            (mode,),
        ).fetchall()
        return [(r["timestamp"], r["equity"]) for r in rows]
