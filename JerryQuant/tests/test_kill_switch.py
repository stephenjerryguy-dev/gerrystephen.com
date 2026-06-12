from datetime import datetime, timedelta, timezone

import pytest

from risk.kill_switch import KillSwitch, TradingHalted


def test_clear_switch_allows_trading(tmp_path):
    ks = KillSwitch(tmp_path / "HALT_TRADING.txt")
    assert ks.can_trade()
    ks.assert_can_trade()  # no raise


def test_halt_file_blocks_trading(tmp_path):
    halt = tmp_path / "HALT_TRADING.txt"
    halt.write_text("manual shutdown")
    ks = KillSwitch(halt)
    assert not ks.can_trade()
    with pytest.raises(TradingHalted):
        ks.assert_can_trade()


def test_engage_writes_halt_file(tmp_path):
    halt = tmp_path / "HALT_TRADING.txt"
    ks = KillSwitch(halt)
    ks.engage("daily loss limit hit")
    assert halt.exists()
    assert "daily loss limit hit" in halt.read_text()
    assert not ks.can_trade()


def test_halt_survives_restart(tmp_path):
    halt = tmp_path / "HALT_TRADING.txt"
    KillSwitch(halt).engage("total drawdown limit")
    fresh = KillSwitch(halt)  # simulates a process restart
    assert not fresh.can_trade()


def test_stale_data_engages(tmp_path):
    ks = KillSwitch(tmp_path / "HALT_TRADING.txt")
    old = datetime.now(timezone.utc) - timedelta(hours=48)
    ks.check_data_freshness(old, max_age_hours=30, asset="SPY")
    assert not ks.can_trade()


def test_fresh_data_does_not_engage(tmp_path):
    ks = KillSwitch(tmp_path / "HALT_TRADING.txt")
    recent = datetime.now(timezone.utc) - timedelta(hours=1)
    ks.check_data_freshness(recent, max_age_hours=30, asset="SPY")
    assert ks.can_trade()


def test_unverifiable_balance_engages(tmp_path):
    ks = KillSwitch(tmp_path / "HALT_TRADING.txt")
    ks.check_balance(None)
    assert not ks.can_trade()


def test_negative_balance_engages(tmp_path):
    ks = KillSwitch(tmp_path / "HALT_TRADING.txt")
    ks.check_balance(-12.0)
    assert not ks.can_trade()


def test_valid_balance_does_not_engage(tmp_path):
    ks = KillSwitch(tmp_path / "HALT_TRADING.txt")
    ks.check_balance(1000.0)
    assert ks.can_trade()
