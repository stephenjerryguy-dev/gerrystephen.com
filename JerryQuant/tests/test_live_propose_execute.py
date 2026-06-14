"""Tests for token auto-refresh and the propose/execute split."""

import json
from datetime import datetime, timedelta, timezone

import pytest

import main
from database.db import Database
from core.config import Mode
from execution.robinhood_mcp_broker import RobinhoodMCPBroker
from risk.kill_switch import KillSwitch
from tests.conftest import make_config


# --- token refresh -----------------------------------------------------

def _live_cfg():
    return make_config(
        execution={"live_trading_enabled": True},
    ).model_copy(update={"mode": Mode.LIVE_APPROVED})


def test_refresh_access_token_updates_and_persists(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("ROBINHOOD_MCP_API_KEY=old\nROBINHOOD_MCP_REFRESH_TOKEN=r1\n")
    monkeypatch.setenv("JERRYQUANT_ENV_PATH", str(env))
    monkeypatch.setenv("ROBINHOOD_MCP_URL", "https://x/mcp")
    monkeypatch.setenv("ROBINHOOD_MCP_API_KEY", "old")
    monkeypatch.setenv("ROBINHOOD_MCP_REFRESH_TOKEN", "r1")
    b = RobinhoodMCPBroker(_live_cfg(), KillSwitch(tmp_path / "HALT.txt"))

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return {"access_token": "new", "refresh_token": "r2"}

    import httpx
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResp())
    assert b.refresh_access_token() is True
    assert b.api_key == "new"
    assert b.refresh_token == "r2"
    written = env.read_text()
    assert "ROBINHOOD_MCP_API_KEY=new" in written
    assert "ROBINHOOD_MCP_REFRESH_TOKEN=r2" in written  # rotation persisted


def test_refresh_without_token_returns_false(tmp_path, monkeypatch):
    monkeypatch.delenv("ROBINHOOD_MCP_REFRESH_TOKEN", raising=False)
    b = RobinhoodMCPBroker(_live_cfg(), KillSwitch(tmp_path / "HALT.txt"))
    b.refresh_token = ""
    assert b.refresh_access_token() is False


# --- execute applies exactly the serialized actions --------------------

class FakeBroker:
    def __init__(self):
        self.calls = []

    def place_order(self, signal, units, manually_approved):
        self.calls.append(("buy", signal.asset, units, manually_approved))
        return {"status": "ok"}

    def sell_position(self, symbol, units, manually_approved):
        self.calls.append(("sell", symbol, units, manually_approved))
        return {"status": "ok"}


class FakeJournal:
    def __init__(self, tmp_path=None):
        self.db = Database(tmp_path / "test.db") if tmp_path else None

    def record_risk_event(self, *a, **k): pass


def _write_pending(tmp_path, actions, age_h=0.0):
    gen = datetime.now(timezone.utc) - timedelta(hours=age_h)
    (tmp_path / main.LIVE_PENDING_FILE).write_text(json.dumps({
        "generated_at": gen.isoformat(), "account_last4": "1530",
        "equity": 100.0, "actions": actions,
    }))


def test_execute_applies_entry_and_exit(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "BASE_DIR", tmp_path)
    fake = FakeBroker()
    monkeypatch.setattr(main, "_arm_live_broker", lambda *a, **k: fake)
    _write_pending(tmp_path, [
        {"kind": "entry", "symbol": "SPY", "units": 0.02, "entry": 740.0,
         "stop": 720.0, "target": 780.0, "dollar_risk": 0.4, "confidence": 80,
         "strategy": "trend_following_v1", "reason": "x", "ticket": "t"},
        {"kind": "exit", "symbol": "QQQ", "units": 0.05, "reference_price": 720.0,
         "reason": "stop hit", "full": True},
    ])
    # pre-existing managed QQQ position so the exit removes it
    (tmp_path / main.LIVE_STATE_FILE).write_text(json.dumps(
        {"positions": {"QQQ": {"entry_price": 700, "stop": 720, "target": 760,
                               "size": 0.05, "opened_at": "2026-06-01T00:00:00+00:00",
                               "strategy": "t", "dollar_risk": 0.3}}}))

    rc = main.run_live_execute(_live_cfg(), FakeJournal(tmp_path), KillSwitch(tmp_path / "HALT.txt"))
    assert rc == 0
    assert ("buy", "SPY", 0.02, True) in fake.calls
    assert ("sell", "QQQ", 0.05, True) in fake.calls
    state = json.loads((tmp_path / main.LIVE_STATE_FILE).read_text())
    assert "SPY" in state["positions"]          # entry recorded
    assert "QQQ" not in state["positions"]       # full exit removed
    assert not (tmp_path / main.LIVE_PENDING_FILE).exists()  # proposal consumed


def test_execute_refuses_stale_proposal(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "BASE_DIR", tmp_path)
    armed = {"called": False}
    def _arm(*a, **k):
        armed["called"] = True
        return FakeBroker()
    monkeypatch.setattr(main, "_arm_live_broker", _arm)
    _write_pending(tmp_path, [{"kind": "entry", "symbol": "SPY", "units": 0.02,
                               "entry": 740, "stop": 720, "target": 780,
                               "dollar_risk": 0.4, "confidence": 80,
                               "strategy": "s", "reason": "x", "ticket": "t"}],
                   age_h=main.LIVE_PENDING_MAX_AGE_H + 5)
    rc = main.run_live_execute(_live_cfg(), FakeJournal(tmp_path), KillSwitch(tmp_path / "HALT.txt"))
    assert rc == 1
    assert armed["called"] is False              # never even armed the broker
    assert not (tmp_path / main.LIVE_PENDING_FILE).exists()  # stale file cleared


def test_execute_noop_without_pending(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "BASE_DIR", tmp_path)
    rc = main.run_live_execute(_live_cfg(), FakeJournal(tmp_path), KillSwitch(tmp_path / "HALT.txt"))
    assert rc == 0


def test_live_state_roundtrip(tmp_path):
    db = Database(tmp_path / "t.db")
    assert db.get_live_state() == {"positions": {}}
    db.save_live_state({"positions": {"SPY": {"stop": 700.0, "scaled_out": True}}})
    again = db.get_live_state()
    assert again["positions"]["SPY"]["stop"] == 700.0
    assert again["positions"]["SPY"]["scaled_out"] is True
    db.close()


def test_token_store_roundtrip_and_upsert(tmp_path):
    db = Database(tmp_path / "t.db")
    assert db.get_token("robinhood_access") is None
    db.set_token("robinhood_access", "abc")
    assert db.get_token("robinhood_access") == "abc"
    db.set_token("robinhood_access", "def")          # upsert, not duplicate
    assert db.get_token("robinhood_access") == "def"
    db.close()


def test_broker_prefers_stored_token_over_env(tmp_path, monkeypatch):
    db = Database(tmp_path / "t.db")
    db.set_token("robinhood_access", "stored-access")
    db.set_token("robinhood_refresh", "stored-refresh")
    monkeypatch.setenv("ROBINHOOD_MCP_API_KEY", "env-access")
    monkeypatch.setenv("ROBINHOOD_MCP_REFRESH_TOKEN", "env-refresh")
    b = RobinhoodMCPBroker(_live_cfg(), KillSwitch(tmp_path / "HALT.txt"), token_store=db)
    assert b.api_key == "stored-access"      # the rotated token wins over the secret
    assert b.refresh_token == "stored-refresh"
    db.close()


def test_broker_seeds_store_from_env_on_first_run(tmp_path, monkeypatch):
    db = Database(tmp_path / "t.db")
    monkeypatch.setenv("ROBINHOOD_MCP_API_KEY", "env-access")
    monkeypatch.setenv("ROBINHOOD_MCP_REFRESH_TOKEN", "env-refresh")
    RobinhoodMCPBroker(_live_cfg(), KillSwitch(tmp_path / "HALT.txt"), token_store=db)
    assert db.get_token("robinhood_access") == "env-access"
    assert db.get_token("robinhood_refresh") == "env-refresh"
    db.close()


def test_refresh_writes_rotated_token_to_store(tmp_path, monkeypatch):
    db = Database(tmp_path / "t.db")
    monkeypatch.setenv("ROBINHOOD_MCP_API_KEY", "env-access")
    monkeypatch.setenv("ROBINHOOD_MCP_REFRESH_TOKEN", "env-refresh")
    # Isolate the env file so refresh's _persist_tokens never touches the
    # real .env (it writes to a cwd-relative ".env" by default).
    monkeypatch.setenv("JERRYQUANT_ENV_PATH", str(tmp_path / ".env"))
    b = RobinhoodMCPBroker(_live_cfg(), KillSwitch(tmp_path / "HALT.txt"), token_store=db)

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return {"access_token": "new-a", "refresh_token": "new-r"}

    import httpx
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResp())
    assert b.refresh_access_token() is True
    assert db.get_token("robinhood_access") == "new-a"   # rotation persisted to Neon
    assert db.get_token("robinhood_refresh") == "new-r"
    db.close()


def test_live_proposal_dedupe_suppresses_same_action(tmp_path):
    journal = FakeJournal(tmp_path)
    action = {"kind": "entry", "symbol": "SPY", "units": 0.02, "entry": 740.0,
              "stop": 720.0, "target": 780.0, "dollar_risk": 0.4,
              "confidence": 80, "strategy": "trend_following_v1",
              "reason": "same setup"}

    fresh, notes = main._filter_new_live_proposals(journal, [action.copy()], "live_plan")
    assert len(fresh) == 1
    assert notes == []

    fresh, notes = main._filter_new_live_proposals(journal, [action.copy()], "live_scan")
    assert fresh == []
    assert "already proposed today" in notes[0]
