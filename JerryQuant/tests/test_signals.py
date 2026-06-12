from database.models import SignalType
from strategies import signal_aggregator, trend_following
from tests.conftest import downtrend_df, make_config, uptrend_df


def _signal(cfg, df):
    ind = trend_following.compute_indicators(df, cfg)
    return trend_following.evaluate(ind, "TEST", cfg)


def test_uptrend_breakout_generates_entry():
    cfg = make_config()
    sig = _signal(cfg, uptrend_df())
    assert sig is not None
    assert sig.signal_type == SignalType.ENTRY
    assert sig.confidence >= cfg.risk.min_confidence
    assert sig.risk_reward >= cfg.risk.min_risk_reward
    assert any("Breakout" in r or "Pullback" in r for r in sig.reasons_for)


def test_downtrend_generates_avoid():
    cfg = make_config()
    sig = _signal(cfg, downtrend_df())
    assert sig is not None
    assert sig.signal_type == SignalType.AVOID
    assert any("below" in r for r in sig.reasons_against)


def test_quiet_uptrend_without_setup_is_not_entry():
    cfg = make_config()
    sig = _signal(cfg, uptrend_df(breakout_last_bar=False))
    assert sig is None or sig.signal_type == SignalType.AVOID


def test_insufficient_history_returns_none():
    cfg = make_config()
    df = uptrend_df(days=100)
    ind = trend_following.compute_indicators(df, cfg)
    assert trend_following.evaluate(ind, "TEST", cfg) is None


def test_negative_sentiment_can_demote_entry():
    cfg = make_config()
    sig = _signal(cfg, uptrend_df())
    assert sig.signal_type == SignalType.ENTRY
    # Pull confidence below threshold with maximum negative adjustments.
    sig.confidence = cfg.risk.min_confidence + 5
    adjusted = signal_aggregator.apply_confidence_adjustments(sig, -10, -10, cfg)
    assert adjusted.signal_type == SignalType.AVOID


def test_positive_sentiment_cannot_rescue_weak_signal():
    cfg = make_config()
    sig = _signal(cfg, uptrend_df())
    sig.confidence = cfg.risk.min_confidence - 5  # below threshold
    adjusted = signal_aggregator.apply_confidence_adjustments(sig, 10, 10, cfg)
    assert adjusted.confidence == cfg.risk.min_confidence - 5  # unchanged
    assert adjusted.signal_type == SignalType.AVOID


def test_adjustments_are_clamped():
    cfg = make_config()
    sig = _signal(cfg, uptrend_df())
    base = sig.confidence
    adjusted = signal_aggregator.apply_confidence_adjustments(sig, -999, -999, cfg)
    max_down = (
        cfg.signals.sentiment_max_confidence_adjust
        + cfg.signals.prediction_market_max_confidence_adjust
    )
    assert adjusted.confidence == max(0, base - max_down)


def test_filter_actionable_drops_low_confidence():
    cfg = make_config()
    sig = _signal(cfg, uptrend_df())
    assert signal_aggregator.filter_actionable([sig], cfg) == [sig]
    sig.confidence = 50
    assert signal_aggregator.filter_actionable([sig], cfg) == []


def test_exit_on_trend_break():
    cfg = make_config()
    ind = trend_following.compute_indicators(downtrend_df(), cfg)
    reason = trend_following.should_exit(ind, cfg)
    assert reason is not None
    assert "Trend broken" in reason


def test_no_exit_in_healthy_uptrend():
    cfg = make_config()
    ind = trend_following.compute_indicators(uptrend_df(), cfg)
    assert trend_following.should_exit(ind, cfg) is None
