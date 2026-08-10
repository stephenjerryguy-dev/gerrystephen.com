"""Execute failures must be reported, not silent — and must not abort the batch."""

import json
from datetime import datetime, timezone

import pytest

import main
from execution.robinhood_mcp_broker import OrderError
from tests.test_live_propose_execute import FakeJournal, _live_cfg, _write_pending


class PartlyBrokenBroker:
    """First order raises a NON-broker exception, second should still run."""
    def __init__(self):
        self.calls = []

    def place_order(self, signal, units, manually_approved):
        self.calls.append(signal.asset)
        if signal.asset == "SKHY":
            raise ValueError("no usable quote; refusing to buy blind")
        return {"status": "ok"}

    def sell_position(self, symbol, units, manually_approved):
        self.calls.append(symbol)
        return {"status": "ok"}


def _two_copies(tmp_path):
    _write_pending(tmp_path, [
        {"kind": "entry", "symbol": "SKHY", "units": 0.05, "entry": 137.91,
         "stop": 126.88, "target": None, "dollar_risk": 0.6, "confidence": 50,
         "strategy": "paste_copy", "reason": "copy", "ticket": "t"},
        {"kind": "entry", "symbol": "NBIS", "units": 0.04, "entry": 187.97,
         "stop": 172.93, "target": None, "dollar_risk": 0.6, "confidence": 50,
         "strategy": "paste_copy", "reason": "copy", "ticket": "t"},
    ])


def test_one_bad_order_does_not_abandon_the_rest(tmp_path, monkeypatch):
    """A ValueError used to escape the loop and kill the job, so a single bad
    ticket silently cancelled every other trade that session."""
    monkeypatch.setattr(main, "BASE_DIR", tmp_path)
    broker = PartlyBrokenBroker()
    monkeypatch.setattr(main, "_arm_live_broker", lambda *a, **k: broker)
    _two_copies(tmp_path)

    rc = main.run_live_execute(_live_cfg(), FakeJournal(tmp_path),
                               main.KillSwitch(tmp_path / "HALT.txt"))
    assert rc == 1                       # reports failure
    assert "NBIS" in broker.calls        # but still placed the good one


def test_failures_are_written_to_the_job_summary(tmp_path, monkeypatch):
    """The reason must be readable without CI log access."""
    monkeypatch.setattr(main, "BASE_DIR", tmp_path)
    monkeypatch.setattr(main, "_arm_live_broker",
                        lambda *a, **k: PartlyBrokenBroker())
    summary = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    _two_copies(tmp_path)

    main.run_live_execute(_live_cfg(), FakeJournal(tmp_path),
                          main.KillSwitch(tmp_path / "HALT.txt"))
    text = summary.read_text()
    assert "FAILED" in text
    assert "SKHY" in text and "refusing to buy blind" in text
