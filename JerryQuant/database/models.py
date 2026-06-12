"""Domain models shared across JerryQuant, plus the SQLite schema.

These dataclasses are the single source of truth for what a signal, a
trade ticket, a position, and a completed trade look like.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


class Direction(str, enum.Enum):
    LONG = "LONG"
    # Short selling is intentionally unsupported. Do not add SHORT.


class SignalType(str, enum.Enum):
    ENTRY = "ENTRY"
    EXIT = "EXIT"
    AVOID = "AVOID"  # explicit "do not trade" finding, journaled for the record


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Signal:
    asset: str
    signal_type: SignalType
    direction: Direction
    entry: float
    stop: Optional[float]
    target: Optional[float]
    confidence: int                      # 0-100
    strategy: str
    data_sources: list[str] = field(default_factory=list)
    reasons_for: list[str] = field(default_factory=list)
    reasons_against: list[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=utcnow)

    @property
    def risk_reward(self) -> Optional[float]:
        if self.stop is None or self.target is None:
            return None
        risk = self.entry - self.stop
        reward = self.target - self.entry
        if risk <= 0:
            return None
        return reward / risk


@dataclass
class TradeTicket:
    """Everything a human needs to see before approving a trade."""

    signal: Signal
    position_size: float                 # units of the asset
    position_value_usd: float
    max_dollar_loss: float
    portfolio_equity: float
    open_positions: int
    current_exposure_pct: float
    crypto_exposure_pct: float
    reason_to_trade: str
    reason_not_to_trade: str

    def render(self) -> str:
        s = self.signal
        rr = s.risk_reward
        lines = [
            "=" * 62,
            "TRADE TICKET — MANUAL APPROVAL REQUIRED",
            "=" * 62,
            f"Asset:              {s.asset}",
            f"Direction:          {s.direction.value}",
            f"Entry price:        ${s.entry:,.4f}",
            f"Stop loss:          ${s.stop:,.4f}" if s.stop else "Stop loss:          NOT SET (trade blocked)",
            f"Take profit:        ${s.target:,.4f}" if s.target else "Take profit:        NOT SET",
            f"Position size:      {self.position_size:.6f} units (${self.position_value_usd:,.2f})",
            f"Max dollar loss:    ${self.max_dollar_loss:,.2f}",
            f"Risk/reward:        {rr:.2f}:1" if rr else "Risk/reward:        N/A",
            f"Confidence:         {s.confidence}/100",
            f"Strategy:           {s.strategy}",
            f"Data sources:       {', '.join(s.data_sources) or 'none'}",
            f"Reason to trade:    {self.reason_to_trade}",
            f"Reason NOT to:      {self.reason_not_to_trade}",
            f"Portfolio equity:   ${self.portfolio_equity:,.2f}",
            f"Open positions:     {self.open_positions}",
            f"Total exposure:     {self.current_exposure_pct:.1f}%",
            f"Crypto exposure:    {self.crypto_exposure_pct:.1f}%",
            "=" * 62,
        ]
        return "\n".join(lines)


@dataclass
class Position:
    asset: str
    direction: Direction
    size: float
    entry_price: float
    stop: float
    target: float
    opened_at: datetime
    strategy: str
    dollar_risk: float

    def value(self, price: float) -> float:
        return self.size * price

    def unrealized_pnl(self, price: float) -> float:
        return self.size * (price - self.entry_price)


@dataclass
class Trade:
    """A completed (closed) trade, as stored in the journal."""

    asset: str
    direction: Direction
    size: float
    entry_price: float
    exit_price: float
    stop: float
    target: float
    dollar_risk: float
    confidence: int
    strategy: str
    data_sources: list[str]
    reasoning: str
    opened_at: datetime
    closed_at: datetime
    exit_reason: str
    fees: float = 0.0
    pnl: float = 0.0

    @property
    def holding_days(self) -> float:
        return (self.closed_at - self.opened_at).total_seconds() / 86400


SCHEMA = """
CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    asset TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry REAL,
    stop REAL,
    target REAL,
    confidence INTEGER,
    strategy TEXT,
    data_sources TEXT,
    reasons_for TEXT,
    reasons_against TEXT
);

CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset TEXT NOT NULL,
    direction TEXT NOT NULL,
    size REAL NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL,
    stop REAL,
    target REAL,
    dollar_risk REAL,
    confidence INTEGER,
    strategy TEXT,
    data_sources TEXT,
    reasoning TEXT,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    exit_reason TEXT,
    fees REAL DEFAULT 0,
    pnl REAL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT 'PAPER',
    link TEXT
);

CREATE TABLE IF NOT EXISTS equity_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    equity REAL NOT NULL,
    mode TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    event TEXT NOT NULL,
    detail TEXT
);
"""
