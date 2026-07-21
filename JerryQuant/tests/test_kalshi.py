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
        b.place_order("T", "maybe", 10, 0.5, manually_approved=True)
    with pytest.raises(KalshiOrderError):
        b.place_order("T", "yes", 0, 0.5, manually_approved=True)
    with pytest.raises(KalshiOrderError):        # price must be 0-1 dollars
        b.place_order("T", "yes", 10, 54, manually_approved=True)


def test_order_placement_is_deliberately_unimplemented(tmp_path, monkeypatch):
    b = _broker(tmp_path)
    monkeypatch.setattr(b, "assert_armed", lambda: None)
    with pytest.raises(NotImplementedError, match="does not guess"):
        b.place_order("T", "yes", 10, 0.54, manually_approved=True)


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
