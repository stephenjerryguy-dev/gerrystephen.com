from pathlib import Path

import pytest
from pydantic import ValidationError

from core.config import Config, Mode, load_config
from tests.conftest import make_config

REPO_CONFIG = Path(__file__).resolve().parents[1] / "config.yaml"


def test_shipped_config_loads_and_is_safe():
    cfg = load_config(REPO_CONFIG)
    assert cfg.mode == Mode.BACKTEST                      # default mode
    assert cfg.execution.live_trading_enabled is False    # live disabled
    assert cfg.execution.require_manual_approval is True
    assert cfg.risk.max_risk_per_trade_pct <= 1.0
    assert cfg.risk.min_risk_reward >= 2.0
    assert cfg.risk.min_confidence >= 70
    assert cfg.risk.max_open_positions <= 3
    assert cfg.account.starting_equity_usd == 1000.0
    assert set(cfg.watchlist.crypto) == {"BTC", "ETH", "SOL"}
    assert set(cfg.watchlist.equities) == {"SPY", "QQQ"}


def test_missing_config_raises():
    with pytest.raises(FileNotFoundError):
        load_config("/nonexistent/config.yaml")


def test_defaults_are_conservative():
    cfg = make_config()
    assert cfg.mode == Mode.BACKTEST
    assert cfg.execution.live_trading_enabled is False
    assert cfg.risk.max_risk_per_trade_pct == 1.0
    assert cfg.risk.max_daily_drawdown_pct == 5.0
    assert cfg.risk.max_total_drawdown_pct == 10.0
    assert cfg.risk.max_crypto_allocation_pct == 40.0


def test_cannot_disable_manual_approval():
    with pytest.raises(ValidationError):
        make_config(execution={"require_manual_approval": False})


def test_cannot_exceed_hard_risk_ceiling():
    with pytest.raises(ValidationError):
        make_config(risk={"max_risk_per_trade_pct": 5.0})


def test_cannot_loosen_risk_reward_floor():
    with pytest.raises(ValidationError):
        make_config(risk={"min_risk_reward": 1.0})


def test_cannot_loosen_confidence_floor():
    with pytest.raises(ValidationError):
        make_config(risk={"min_confidence": 40})


def test_cannot_exceed_position_count_ceiling():
    with pytest.raises(ValidationError):
        make_config(risk={"max_open_positions": 10})


def test_crypto_detection():
    cfg = make_config()
    assert cfg.is_crypto("BTC")
    assert cfg.is_crypto("btc")
    assert not cfg.is_crypto("SPY")
