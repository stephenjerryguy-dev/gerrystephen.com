"""Thin SQLite wrapper for the trade journal and signal history."""

from __future__ import annotations

import json
import os
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
        self._proposal_pg = None
        self._proposal_pg_url = (
            os.environ.get("JERRYQUANT_PROPOSAL_DATABASE_URL")
            or os.environ.get("DATABASE_URL")
        )
        if self._proposal_pg_url:
            self._init_postgres_proposals(self._proposal_pg_url)

    def _init_postgres_proposals(self, url: str) -> None:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as e:
            raise RuntimeError(
                "Postgres proposal ledger requested, but psycopg is not "
                "installed. Add psycopg[binary] to requirements and install it."
            ) from e
        self._proposal_pg = psycopg.connect(url, row_factory=dict_row)
        self._proposal_pg.execute(
            """CREATE TABLE IF NOT EXISTS live_proposals (
                id BIGSERIAL PRIMARY KEY,
                fingerprint TEXT NOT NULL UNIQUE,
                timestamp TIMESTAMPTZ NOT NULL,
                source TEXT NOT NULL,
                status TEXT NOT NULL,
                symbol TEXT NOT NULL,
                kind TEXT NOT NULL,
                action_json JSONB NOT NULL,
                detail TEXT
            )"""
        )
        self._proposal_pg.commit()

    def close(self) -> None:
        self._conn.close()
        if self._proposal_pg is not None:
            self._proposal_pg.close()

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

    # --- live proposal ledger ---

    def proposal_by_fingerprint(self, fingerprint: str) -> Optional[sqlite3.Row]:
        if self._proposal_pg is not None:
            return self._proposal_pg.execute(
                "SELECT * FROM live_proposals WHERE fingerprint = %s",
                (fingerprint,),
            ).fetchone()
        return self._conn.execute(
            "SELECT * FROM live_proposals WHERE fingerprint = ?",
            (fingerprint,),
        ).fetchone()

    def insert_live_proposal(
        self,
        fingerprint: str,
        timestamp: datetime,
        source: str,
        symbol: str,
        kind: str,
        action: dict[str, Any],
        detail: str = "",
        status: str = "proposed",
    ) -> int:
        if self._proposal_pg is not None:
            cur = self._proposal_pg.execute(
                """INSERT INTO live_proposals
                   (fingerprint, timestamp, source, status, symbol, kind,
                    action_json, detail)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (
                    fingerprint,
                    timestamp,
                    source,
                    status,
                    symbol,
                    kind,
                    json.dumps(action, sort_keys=True),
                    detail,
                ),
            )
            row = cur.fetchone()
            self._proposal_pg.commit()
            return int(row["id"])
        cur = self._conn.execute(
            """INSERT INTO live_proposals
               (fingerprint, timestamp, source, status, symbol, kind,
                action_json, detail)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                fingerprint,
                timestamp.isoformat(),
                source,
                status,
                symbol,
                kind,
                json.dumps(action, sort_keys=True),
                detail,
            ),
        )
        self._conn.commit()
        return int(cur.lastrowid)

    def update_live_proposal_status(self, fingerprint: str, status: str,
                                    detail: str = "") -> None:
        if self._proposal_pg is not None:
            self._proposal_pg.execute(
                """UPDATE live_proposals
                   SET status = %s, detail = COALESCE(NULLIF(%s, ''), detail)
                   WHERE fingerprint = %s""",
                (status, detail, fingerprint),
            )
            self._proposal_pg.commit()
            return
        self._conn.execute(
            """UPDATE live_proposals
               SET status = ?, detail = COALESCE(NULLIF(?, ''), detail)
               WHERE fingerprint = ?""",
            (status, detail, fingerprint),
        )
        self._conn.commit()
