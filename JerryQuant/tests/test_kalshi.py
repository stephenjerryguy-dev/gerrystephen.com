"""Tests for Kalshi market data + the (disarmed) order path.

Payloads mirror LIVE Kalshi responses — note the `*_dollars` field names,
which is the whole reason this was probed instead of written from memory.
"""

import pytest

from data_sources import kalshi
from execution.kalshi_broker import KalshiBroker, KalshiDisabled, KalshiOrderError
from risk.kill_switch import KillSwitch
from tests.conftest import make_config

# Shape taken from a real response for KXHIGHNY-26JUL22-T84.
LIVE_SHAPE = {
    "ticker": "KXHIGHNY-26JUL22-T84",
    "event_ticker": "KXHIGHNY-26JUL22",
    "title": "Will the high temp in NYC be <84 on Jul 22?",
    "status": "active",
    "yes_bid_dollars": "0.5100",
    "yes_ask_dollars": "0.5400",
    "last_price_dollars": "0.5200",
    "close_time": "2026-07-23T04:59:00Z",
    "liquidity_dollars": "1234.00",
    "volume_fp": "500",
}


def test_parses_live_dollar_field_names():
    m = kalshi._parse_market(LIVE_SHAPE)
    assert m.ticker == "KXHIGHNY-26JUL22-T84"
    assert m.yes_bid == 0.51 and m.yes_ask == 0.54
    assert m.last_price == 0.52
    assert abs(m.mid_price - 0.525) < 1e-9
    assert abs(m.spread - 0.03) < 1e-9
    assert m.is_tradable


def test_missing_prices_are_not_tradable():
    """A market with no book must never look like a trade."""
    m = kalshi._parse_market({"ticker": "X", "status": "active"})
    assert m.yes_ask is None
    assert m.mid_price is None
    assert not m.is_tradable


def test_edge_is_measured_against_the_ask_not_the_mid():
    m = kalshi._parse_market(LIVE_SHAPE)
    # You pay the ask (0.54). A 60% estimate is a 6-point edge, not 7.5.
    assert abs(m.edge_vs(0.60) - 0.06) < 1e-9
    # An estimate that only beats the mid is NOT an edge.
    assert m.edge_vs(0.53) < 0


def test_fetch_markets_raises_on_bad_shape(monkeypatch):
    class R:
        def raise_for_status(self): pass
        def json(self): return {"unexpected": []}
    import httpx
    monkeypatch.setattr(httpx, "get", lambda *a, **k: R())
    with pytest.raises(kalshi.KalshiUnavailableError):
        kalshi.fetch_markets("KXHIGHNY")


def test_fetch_markets_parses(monkeypatch):
    class R:
        def raise_for_status(self): pass
        def json(self): return {"markets": [LIVE_SHAPE]}
    import httpx
    monkeypatch.setattr(httpx, "get", lambda *a, **k: R())
    out = kalshi.fetch_markets("KXHIGHNY")
    assert len(out) == 1 and out[0].yes_ask == 0.54


# --- broker: disarmed by default ---

def _broker(tmp_path):
    return KalshiBroker(make_config(), KillSwitch(tmp_path / "HALT.txt"))


def test_broker_disarmed_by_default(tmp_path, monkeypatch):
    monkeypatch.delenv("KALSHI_API_KEY_ID", raising=False)
    monkeypatch.delenv("KALSHI_PRIVATE_KEY", raising=False)
    b = _broker(tmp_path)
    assert b.is_armed() is False
    with pytest.raises(KalshiDisabled):
        b.place_order("KXHIGHNY-26JUL22-T84", "yes", 10, 0.54, manually_approved=True)


def test_broker_refuses_without_approval(tmp_path, monkeypatch):
    b = _broker(tmp_path)
    monkeypatch.setattr(b, "assert_armed", lambda: None)
    with pytest.raises(KalshiDisabled, match="approval"):
        b.place_order("T", "yes", 10, 0.5, manually_approved=False)


def test_broker_validates_inputs(tmp_path, monkeypatch):
    b = _broker(tmp_path)
    monkeypatch.setattr(b, "assert_armed", lambda: None)
    with pytest.raises(KalshiOrderError):
        b.place_order("T", "yes", 10, 0.5, manually_approved=True)  # side is bid/ask
    with pytest.raises(KalshiOrderError):
        b.place_order("T", "yes", 0, 0.5, manually_approved=True)
    with pytest.raises(KalshiOrderError):        # price must be 0-1 dollars
        b.place_order("T", "yes", 10, 54, manually_approved=True)


def test_private_key_can_come_from_a_file(tmp_path, monkeypatch):
    """Kalshi issues a multi-line PEM — pointing at the file beats mangling
    it into a single-line .env value."""
    pem = tmp_path / "kalshi.pem"
    pem.write_text("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----")
    monkeypatch.delenv("KALSHI_PRIVATE_KEY", raising=False)
    monkeypatch.setenv("KALSHI_API_KEY_ID", "key-123")
    monkeypatch.setenv("KALSHI_PRIVATE_KEY_PATH", str(pem))
    b = KalshiBroker(make_config(), KillSwitch(tmp_path / "HALT.txt"))
    assert b.credentials_present() is True
    assert "BEGIN RSA PRIVATE KEY" in b.private_key


def test_missing_key_file_just_means_not_armed(tmp_path, monkeypatch):
    monkeypatch.delenv("KALSHI_PRIVATE_KEY", raising=False)
    monkeypatch.setenv("KALSHI_API_KEY_ID", "key-123")
    monkeypatch.setenv("KALSHI_PRIVATE_KEY_PATH", str(tmp_path / "nope.pem"))
    b = KalshiBroker(make_config(), KillSwitch(tmp_path / "HALT.txt"))
    assert b.credentials_present() is False   # never a half-armed state


def test_balance_uses_dollars_not_the_cents_field(tmp_path, monkeypatch):
    """Discovery landmine: `balance` is CENTS (2500 == $25) while
    `balance_dollars` is the dollar figure. Reading the wrong one would size
    every position 100x too large."""
    b = _broker(tmp_path)
    monkeypatch.setattr(b, "_get", lambda path: {
        "balance": 2500, "balance_dollars": "25.0000", "portfolio_value": 0})
    assert b.get_balance() == 25.0


def test_balance_returns_none_when_unverifiable(tmp_path, monkeypatch):
    b = _broker(tmp_path)
    def boom(path): raise RuntimeError("network down")
    monkeypatch.setattr(b, "_get", boom)
    assert b.get_balance() is None   # never guess a balance


def test_order_path_is_the_verified_v2_endpoint():
    from execution import kalshi_broker
    # The obvious /portfolio/orders is deprecated (410) — verified live.
    assert kalshi_broker.ORDER_PATH == "/trade-api/v2/portfolio/events/orders"


def _armed(tmp_path, monkeypatch, balance=25.0):
    b = _broker(tmp_path)
    monkeypatch.setattr(b, "assert_armed", lambda: None)
    monkeypatch.setattr(b, "_signed_headers", lambda m, p: {"KALSHI-ACCESS-KEY": "k"})
    monkeypatch.setattr(b, "get_balance", lambda: balance)
    return b


def test_order_body_matches_verified_schema(tmp_path, monkeypatch):
    """Field names/values come from Kalshi's create-order-v2 reference:
    side is bid/ask, count+price are STRINGS, and the STP enum is
    'taker_at_cross' — none of which are guessable."""
    b = _armed(tmp_path, monkeypatch)
    sent = {}

    class R:
        status_code = 200
        def json(self): return {"order": {"status": "resting"}}

    import httpx
    def fake_post(url, headers=None, json=None, timeout=None):
        sent["url"] = url; sent["body"] = json
        return R()
    monkeypatch.setattr(httpx, "post", fake_post)

    b.place_order("KXHIGHNY-26JUL22-T84", "bid", 2, 0.54, manually_approved=True)
    body = sent["body"]
    assert sent["url"].endswith("/trade-api/v2/portfolio/events/orders")
    assert body["side"] == "bid"
    assert body["count"] == "2.00" and body["price"] == "0.5400"   # strings
    assert body["self_trade_prevention_type"] == "taker_at_cross"
    assert body["time_in_force"] == "immediate_or_cancel"          # no resting order
    assert len(body["client_order_id"]) == 36                      # idempotency


def test_stake_cap_blocks_oversized_order(tmp_path, monkeypatch):
    b = _armed(tmp_path, monkeypatch, balance=25.0)
    # 40 contracts @ $0.54 = $21.60 on a $25 balance — way past the cap.
    with pytest.raises(KalshiOrderError, match="cap"):
        b.place_order("T", "bid", 40, 0.54, manually_approved=True)


def test_unverifiable_balance_blocks_order(tmp_path, monkeypatch):
    b = _armed(tmp_path, monkeypatch)
    monkeypatch.setattr(b, "get_balance", lambda: None)
    with pytest.raises(KalshiOrderError, match="could not be verified"):
        b.place_order("T", "bid", 1, 0.5, manually_approved=True)
