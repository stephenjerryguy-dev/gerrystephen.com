"""Momentum strategy — placeholder, disabled at launch.

Kept as a stub so the aggregator interface is established. Enable in
config.yaml (strategy.momentum.enabled) only after it has been built and
backtested. Until then it always returns None.
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

from core.config import Config
from database.models import Signal

STRATEGY_NAME = "momentum_v0_disabled"


def evaluate(df: pd.DataFrame, asset: str, cfg: Config) -> Optional[Signal]:
    if not cfg.strategy.momentum.enabled:
        return None
    raise NotImplementedError(
        "Momentum strategy is not implemented yet. Keep it disabled in config."
    )
