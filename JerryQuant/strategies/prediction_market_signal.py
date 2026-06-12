"""Prediction-market signal — research notes and confidence nudges ONLY.

This module never generates trades. It turns Polymarket/Kalshi-style
probabilities into (a) human-readable research notes and (b) a bounded
confidence adjustment applied by the signal aggregator. The adjustment is
clamped to ±signals.prediction_market_max_confidence_adjust and can never
push a failing signal over the entry threshold on its own by design —
the aggregator only ever applies negative-or-zero net adjustments to
entry decisions (see signal_aggregator.apply_confidence_adjustments).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from core.config import Config
from data_sources.prediction_market_data import MarketProbability


@dataclass
class PredictionMarketView:
    asset: str
    confidence_adjust: int          # bounded, see module docstring
    notes: list[str] = field(default_factory=list)


def assess(
    asset: str, probabilities: list[MarketProbability], cfg: Config
) -> PredictionMarketView:
    """Convert related prediction-market probabilities into a view.

    Markets strongly implying adverse macro outcomes reduce confidence.
    Favorable markets add at most a small positive nudge.
    """
    cap = cfg.signals.prediction_market_max_confidence_adjust
    if not probabilities:
        return PredictionMarketView(asset=asset, confidence_adjust=0,
                                    notes=["No prediction-market data available"])

    adjust = 0
    notes = []
    for m in probabilities:
        notes.append(
            f"{m.market}: {m.probability:.0%} ({m.source})"
        )
        if m.bearish_for_asset and m.probability >= 0.6:
            adjust -= 5
        elif not m.bearish_for_asset and m.probability >= 0.7:
            adjust += 2

    adjust = max(-cap, min(cap, adjust))
    return PredictionMarketView(asset=asset, confidence_adjust=adjust, notes=notes)
