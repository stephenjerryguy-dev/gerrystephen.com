from datetime import datetime, timedelta, timezone

from data_sources.paste_trade import PasteTrade
from strategies.paste_trade_router import build_live_tickets, ticket_fingerprint


NOW = datetime(2026, 7, 20, 16, 0, tzinfo=timezone.utc)


def trade(symbol="BTC", direction="LONG", minutes=5, handle="@notthreadguy",
          venue_symbol="BTC"):
    return PasteTrade(
        trade_id=f"t-{symbol}-{direction}",
        symbol=symbol,
        direction=direction,
        leverage=20,
        source_handle=handle,
        source_url="https://app.paste.trade/s/x#t-y",
        author_date=NOW - timedelta(minutes=minutes),
        venue_symbol=venue_symbol,
        current_price=100.0,
    )


def test_fresh_crypto_routes_to_hyperliquid_and_fails_closed(monkeypatch):
    monkeypatch.delenv("JERRYQUANT_HL_COPY_BUDGET_USD", raising=False)
    result = build_live_tickets([trade()], ["notthreadguy"], now=NOW)
    ticket = result.tickets[0]
    assert ticket.venue == "hyperliquid"
    assert ticket.leverage_cap == 2
    assert ticket.status == "BLOCKED"
    assert any("BUDGET" in blocker for blocker in ticket.blockers)


def test_fresh_equity_long_routes_to_robinhood():
    result = build_live_tickets(
        [trade("GOOGL", "LONG", venue_symbol="xyz:GOOGL")],
        ["@notthreadguy"],
        now=NOW,
    )
    assert result.tickets[0].venue == "robinhood"
    assert result.tickets[0].symbol == "GOOGL"


def test_equity_short_routes_to_hyperliquid():
    result = build_live_tickets(
        [trade("ORCL", "SHORT", venue_symbol="xyz:ORCL")],
        ["notthreadguy"],
        now=NOW,
    )
    assert result.tickets[0].venue == "hyperliquid"


def test_stale_and_conflicting_signals_are_skipped():
    stale = trade("SOL", "LONG", minutes=45)
    long = trade("BTC", "LONG")
    short = trade("BTC", "SHORT")
    result = build_live_tickets(
        [stale, long, short], ["notthreadguy"], now=NOW
    )
    assert result.tickets == ()
    assert any("stale" in reason for reason in result.skipped)
    assert any("conflict" in reason for reason in result.skipped)


def test_unselected_handle_is_ignored():
    result = build_live_tickets(
        [trade(handle="@someone_else")], ["notthreadguy"], now=NOW
    )
    assert result.tickets == ()


def test_ticket_fingerprint_is_stable_and_venue_scoped():
    ticket = build_live_tickets([trade()], ["notthreadguy"], now=NOW).tickets[0]
    assert ticket_fingerprint(ticket) == ticket_fingerprint(ticket)
    equity = build_live_tickets(
        [trade("GOOGL", venue_symbol="xyz:GOOGL")],
        ["notthreadguy"],
        now=NOW,
    ).tickets[0]
    assert ticket_fingerprint(ticket) != ticket_fingerprint(equity)
