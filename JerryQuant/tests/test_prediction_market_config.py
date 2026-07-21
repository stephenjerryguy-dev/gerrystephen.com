"""The prediction-market venue ships disabled, and its hard caps cannot be
loosened from config.yaml no matter what is typed in."""

import pytest
from pydantic import ValidationError

from core.config import (
    HARD_MAX_BINARY_AUTO_STAKE_USD,
    HARD_MAX_BINARY_STAKE_PCT,
    HARD_MAX_KELLY_FRACTION,
    Config,
    PredictionMarketConfig,
    load_config,
)


def test_defaults_ship_disabled_and_safe():
    pm = PredictionMarketConfig()
    assert pm.enabled is False
    assert pm.auto_execute is False
    assert pm.kelly_fraction <= HARD_MAX_KELLY_FRACTION
    assert pm.max_stake_pct <= HARD_MAX_BINARY_STAKE_PCT
    assert pm.auto_max_stake_usd <= HARD_MAX_BINARY_AUTO_STAKE_USD


def test_kelly_fraction_cannot_exceed_hard_ceiling():
    with pytest.raises(ValidationError):
        PredictionMarketConfig(kelly_fraction=0.9)  # > 0.5 full-Kelly guard


def test_stake_pct_cannot_exceed_hard_ceiling():
    with pytest.raises(ValidationError):
        PredictionMarketConfig(max_stake_pct=25.0)  # > 10%


def test_auto_stake_cannot_exceed_hard_ceiling():
    with pytest.raises(ValidationError):
        PredictionMarketConfig(auto_max_stake_usd=500.0)  # > $50


def test_min_confidence_respects_global_floor():
    with pytest.raises(ValidationError):
        PredictionMarketConfig(min_confidence=10)  # below HARD_MIN_CONFIDENCE


def test_repo_config_yaml_loads_with_venue_disabled():
    # The shipped config.yaml must parse and have the venue off.
    cfg = load_config("config.yaml")
    assert isinstance(cfg, Config)
    assert cfg.prediction_market.enabled is False
    assert cfg.prediction_market.weather.enabled is False
