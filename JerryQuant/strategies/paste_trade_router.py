"""Turn selected paste.trade observations into non-executing live tickets.

The router deliberately stops before order creation. A ticket identifies the
venue and the missing owner decisions; it cannot be consumed by a broker.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from data_sources.paste_trade import PasteTrade


@dataclass(frozen=True)
class RoutedTicket:
    trade_id: str
    venue: str
    symbol: str
    direction: str
    source_handle: str
    source_url: str
    observed_at: datetime
    expires_at: datetime
    source_leverage: int | None
    leverage_cap: int
    entry_reference: float | None
    status: str
    blockers: tuple[str, ...] = field(default_factory=tuple)
    # How the SOURCE's own trade is doing, signed for direction. A copy is not
    # just a symbol and a side: a thesis already moving against its author is a
    # materially worse setup than the same call fresh and working.
    source_entry: float | None = None
    source_progress_pct: float | None = None


@dataclass(frozen=True)
class RoutingResult:
    tickets: tuple[RoutedTicket, ...]
    skipped: tuple[str, ...]


def _progress_pct(trade) -> float | None:
    """Unlevered move in the SOURCE's favour since they opened, in percent."""
    entry, current = trade.entry_price, trade.current_price
    if not entry or entry <= 0 or current is None:
        return None
    move = (current - entry) / entry * 100.0
    return -move if str(trade.direction).upper() == "SHORT" else move


def ticket_fingerprint(ticket: RoutedTicket) -> str:
    raw = f"paste.trade|{ticket.venue}|{ticket.trade_id}"
    return sha256(raw.encode("utf-8")).hexdigest()[:24]


def _env_amount(name: str) -> float | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if value > 0 else None


def _is_robinhood_equity_candidate(trade: PasteTrade) -> bool:
    """paste.trade maps Hyperliquid equity perps to the ``xyz:`` namespace."""
    venue_symbol = (trade.venue_symbol or "").lower()
    return venue_symbol.startswith("xyz:") and trade.symbol.isalpha()


def build_live_tickets(
    trades: list[PasteTrade],
    selected_handles: list[str],
    *,
    now: datetime | None = None,
    max_age_minutes: int = 30,
    approval_window_minutes: int = 10,
    hyperliquid_leverage_cap: int = 2,
) -> RoutingResult:
    now = now or datetime.now(timezone.utc)
    allowed = {h.lower().lstrip("@") for h in selected_handles}
    # "*" opts out of a hand-picked author list in favour of the quality gates
    # (freshness, direction, the source's own progress, tradability). Choosing
    # WHOSE calls to follow is an investment decision; this makes that choice
    # explicit and reversible rather than burying names in config.
    any_handle = "*" in allowed
    skipped: list[str] = []
    candidates: list[PasteTrade] = []

    for trade in trades:
        handle = (trade.source_handle or "").lower().lstrip("@")
        if not any_handle and handle not in allowed:
            continue
        if trade.author_date is None:
            skipped.append(f"{trade.trade_id}: missing source timestamp")
            continue
        age = now - trade.author_date.astimezone(timezone.utc)
        if age < timedelta(minutes=-2) or age > timedelta(minutes=max_age_minutes):
            skipped.append(f"{trade.trade_id}: stale source ({age.total_seconds()/60:.0f}m)")
            continue
        candidates.append(trade)

    directions: dict[str, set[str]] = {}
    for trade in candidates:
        directions.setdefault(trade.symbol, set()).add(trade.direction)
    conflicted = {s for s, values in directions.items() if len(values) > 1}

    rh_budget = _env_amount("JERRYQUANT_RH_COPY_BUDGET_USD")
    hl_budget = _env_amount("JERRYQUANT_HL_COPY_BUDGET_USD")
    max_loss = _env_amount("JERRYQUANT_COPY_MAX_LOSS_USD")
    tickets: list[RoutedTicket] = []
    seen: set[tuple[str, str]] = set()

    for trade in candidates:
        if trade.symbol in conflicted:
            skipped.append(f"{trade.symbol}: fresh LONG/SHORT conflict")
            continue
        if trade.direction == "LONG" and _is_robinhood_equity_candidate(trade):
            venue = "robinhood"
            venue_symbol = trade.symbol
            budget = rh_budget
            leverage_cap = 1
        else:
            venue = "hyperliquid"
            venue_symbol = trade.venue_symbol or trade.symbol
            budget = hl_budget
            leverage_cap = hyperliquid_leverage_cap
        identity = (venue, trade.trade_id)
        if identity in seen:
            continue
        seen.add(identity)

        blockers: list[str] = []
        if budget is None:
            blockers.append(f"set {('JERRYQUANT_RH_COPY_BUDGET_USD' if venue == 'robinhood' else 'JERRYQUANT_HL_COPY_BUDGET_USD')}")
        if max_loss is None:
            blockers.append("set JERRYQUANT_COPY_MAX_LOSS_USD")
        # paste.trade observations do not include an auditable stop. Without
        # one, loss-bounded position sizing is impossible.
        blockers.append("owner must set a stop price before approval")
        tickets.append(RoutedTicket(
            trade_id=trade.trade_id,
            venue=venue,
            symbol=venue_symbol,
            direction=trade.direction,
            source_handle=trade.source_handle or "",
            source_url=trade.source_url,
            observed_at=now,
            expires_at=now + timedelta(minutes=approval_window_minutes),
            source_leverage=trade.leverage,
            leverage_cap=leverage_cap,
            entry_reference=trade.current_price,
            source_entry=trade.entry_price,
            source_progress_pct=_progress_pct(trade),
            status="BLOCKED" if blockers else "REVIEW",
            blockers=tuple(blockers),
        ))
    return RoutingResult(tuple(tickets), tuple(skipped))


def render_live_tickets(result: RoutingResult) -> str:
    lines = [
        "# JerryQuant — real-money review queue",
        "",
        "These are expiring review tickets, not submitted orders.",
        "",
    ]
    if not result.tickets:
        lines.append("No fresh selected-source tickets.")
    for ticket in result.tickets:
        px = f" @ ~${ticket.entry_reference:,.4f}" \
            if ticket.entry_reference is not None else ""
        source_lev = f" (source displayed {ticket.source_leverage}x)" \
            if ticket.source_leverage else ""
        lines += [
            f"## {ticket.venue.upper()} · {ticket.direction} {ticket.symbol}{px}",
            f"- Source: {ticket.source_handle}{source_lev} — {ticket.source_url}",
            f"- JerryQuant leverage cap: {ticket.leverage_cap}x",
            f"- Expires: {ticket.expires_at:%Y-%m-%d %H:%M UTC}",
            f"- Status: **{ticket.status}**",
        ]
        lines.extend(f"- Blocker: {reason}" for reason in ticket.blockers)
        lines.append("")
    if result.skipped:
        lines += ["### Skipped", *[f"- {reason}" for reason in result.skipped]]
    return "\n".join(lines)
