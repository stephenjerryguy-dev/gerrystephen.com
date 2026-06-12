"""Signal aggregation.

Collects raw strategy signals, applies bounded confidence adjustments
from the sentiment and prediction-market modules, and re-applies the
risk gates. The asymmetry is deliberate:

- NEGATIVE adjustments (bearish sentiment / adverse prediction markets)
  always apply, and can demote an ENTRY to AVOID.
- POSITIVE adjustments are recorded in the journal but are NOT allowed to
  promote a below-threshold signal to ENTRY. Sentiment can talk us out of
  a trade, never into one.
"""

from __future__ import annotations

from core.config import Config
from database.models import Signal, SignalType


def apply_confidence_adjustments(
    signal: Signal,
    sentiment_adjust: int,
    prediction_adjust: int,
    cfg: Config,
) -> Signal:
    s_cap = cfg.signals.sentiment_max_confidence_adjust
    p_cap = cfg.signals.prediction_market_max_confidence_adjust
    sentiment_adjust = max(-s_cap, min(s_cap, sentiment_adjust))
    prediction_adjust = max(-p_cap, min(p_cap, prediction_adjust))
    total = sentiment_adjust + prediction_adjust

    original_confidence = signal.confidence
    adjusted = max(0, min(100, original_confidence + total))

    if total > 0 and original_confidence < cfg.risk.min_confidence:
        # Positive nudges may not rescue a failing signal.
        adjusted = original_confidence
        signal.reasons_against.append(
            f"Positive sentiment/prediction adjustment (+{total}) ignored: "
            f"base confidence {original_confidence} below threshold"
        )
    elif total != 0:
        signal.reasons_for.append(
            f"Confidence adjusted {total:+d} by sentiment/prediction markets"
        )

    signal.confidence = adjusted

    if (
        signal.signal_type == SignalType.ENTRY
        and signal.confidence < cfg.risk.min_confidence
    ):
        signal.signal_type = SignalType.AVOID
        signal.reasons_against.append(
            f"Demoted to AVOID: adjusted confidence {signal.confidence} "
            f"below {cfg.risk.min_confidence}"
        )
    return signal


def filter_actionable(signals: list[Signal], cfg: Config) -> list[Signal]:
    """Final gate: only ENTRY signals that still satisfy every risk rule."""
    actionable = []
    for s in signals:
        if s.signal_type != SignalType.ENTRY:
            continue
        rr = s.risk_reward
        if s.stop is None:
            continue
        if rr is None or rr < cfg.risk.min_risk_reward:
            continue
        if s.confidence < cfg.risk.min_confidence:
            continue
        actionable.append(s)
    # Highest conviction first; the position cap may only admit some.
    actionable.sort(key=lambda s: s.confidence, reverse=True)
    return actionable
