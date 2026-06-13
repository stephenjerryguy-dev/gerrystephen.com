"""Conservative trend-following swing strategy.

Long-only. A signal requires ALL of:
- price above the 50-day and 200-day moving averages
- 50-day MA above 200-day MA (uptrend structure)
- volume above its 20-day average
- ATR% inside the acceptable volatility band
- a pullback-recovery or breakout setup
- a computable stop loss (ATR-based, below recent swing low)
- risk/reward >= the configured minimum (2:1 default)
- confidence score >= the configured minimum (70 default)

If any condition fails, the strategy returns either None or an explicit
AVOID signal with the reasons, so "no trade" decisions are journaled too.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from core.config import Config
from database.models import Direction, Signal, SignalType

STRATEGY_NAME = "trend_following_v1"


def compute_indicators(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Add indicator columns. Expects columns: open, high, low, close, volume."""
    p = cfg.strategy.trend_following
    out = df.copy()
    out["sma_fast"] = out["close"].rolling(p.fast_ma).mean()
    out["sma_slow"] = out["close"].rolling(p.slow_ma).mean()
    out["vol_ma"] = out["volume"].rolling(p.volume_ma).mean()
    out["dollar_vol_ma"] = (out["close"] * out["volume"]).rolling(p.volume_ma).mean()

    prev_close = out["close"].shift(1)
    tr = pd.concat(
        [
            out["high"] - out["low"],
            (out["high"] - prev_close).abs(),
            (out["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    out["atr"] = tr.rolling(p.atr_period).mean()
    out["atr_pct"] = out["atr"] / out["close"] * 100.0
    out["swing_low"] = out["low"].rolling(p.pullback_lookback).min()
    out["recent_high"] = out["high"].rolling(p.pullback_lookback).max().shift(1)
    return out


def evaluate(
    df: pd.DataFrame,
    asset: str,
    cfg: Config,
    timestamp: Optional[datetime] = None,
    data_sources: Optional[list[str]] = None,
) -> Optional[Signal]:
    """Evaluate the latest bar of an indicator-enriched dataframe.

    Returns an ENTRY signal, an AVOID signal (journalable "do not trade"),
    or None when there is simply not enough history to say anything.
    """
    p = cfg.strategy.trend_following
    r = cfg.risk
    if len(df) < p.slow_ma + 1:
        return None

    bar = df.iloc[-1]
    needed = ["sma_fast", "sma_slow", "vol_ma", "atr", "swing_low", "recent_high"]
    if bar[needed].isna().any():
        return None

    timestamp = timestamp or datetime.now(timezone.utc)
    data_sources = data_sources or [cfg.data.provider]
    close = float(bar["close"])

    reasons_for: list[str] = []
    reasons_against: list[str] = []

    # --- trend structure ---
    if close > bar["sma_fast"]:
        reasons_for.append(f"Price above {p.fast_ma}d MA")
    else:
        reasons_against.append(f"Price below {p.fast_ma}d MA")
    if close > bar["sma_slow"]:
        reasons_for.append(f"Price above {p.slow_ma}d MA")
    else:
        reasons_against.append(f"Price below {p.slow_ma}d MA")
    if bar["sma_fast"] > bar["sma_slow"]:
        reasons_for.append(f"{p.fast_ma}d MA above {p.slow_ma}d MA")
    else:
        reasons_against.append(f"{p.fast_ma}d MA below {p.slow_ma}d MA")

    # --- volume ---
    if bar["volume"] > bar["vol_ma"]:
        reasons_for.append("Volume above 20d average")
    else:
        reasons_against.append("Volume below 20d average")

    # --- liquidity ---
    if bar["dollar_vol_ma"] >= r.min_dollar_volume_20d:
        reasons_for.append("Liquidity adequate")
    else:
        reasons_against.append(
            f"20d avg dollar volume ${bar['dollar_vol_ma']:,.0f} below floor"
        )

    # --- volatility band ---
    atr_pct = float(bar["atr_pct"])
    if r.min_atr_pct <= atr_pct <= r.max_atr_pct:
        reasons_for.append(f"Volatility acceptable (ATR {atr_pct:.2f}%)")
    elif atr_pct > r.max_atr_pct:
        reasons_against.append(f"Volatility too high (ATR {atr_pct:.2f}%)")
    else:
        reasons_against.append(f"Market too quiet (ATR {atr_pct:.2f}%)")

    # --- setup: breakout above recent high, or pullback toward the fast MA
    #     that has turned back up ---
    breakout = close > bar["recent_high"]
    prev = df.iloc[-2]
    near_fast_ma = (
        bar["low"] <= bar["sma_fast"] * 1.02 and close > bar["sma_fast"]
    )
    pullback_recovery = near_fast_ma and close > prev["close"]
    if breakout:
        reasons_for.append("Breakout above recent high")
    elif pullback_recovery:
        reasons_for.append("Pullback to fast MA with recovery")
    else:
        reasons_against.append("No breakout or pullback setup")

    # --- stop / target ---
    atr_stop = close - p.atr_stop_multiple * float(bar["atr"])
    stop = min(atr_stop, float(bar["swing_low"]))
    stop_valid = 0 < stop < close
    if not stop_valid:
        reasons_against.append("Stop loss cannot be calculated")
        stop = None

    target = None
    rr = None
    if stop is not None:
        risk = close - stop
        target = close + r.min_risk_reward * risk
        rr = (target - close) / risk
        if rr >= r.min_risk_reward:
            reasons_for.append(f"Risk/reward {rr:.1f}:1")
        else:
            reasons_against.append(f"Risk/reward {rr:.1f}:1 below minimum")

    confidence = score_confidence(bar, close, breakout, pullback_recovery, cfg)

    trend_ok = (
        close > bar["sma_fast"]
        and close > bar["sma_slow"]
        and bar["sma_fast"] > bar["sma_slow"]
    )
    all_conditions = (
        trend_ok
        and bar["volume"] > bar["vol_ma"]
        and bar["dollar_vol_ma"] >= r.min_dollar_volume_20d
        and r.min_atr_pct <= atr_pct <= r.max_atr_pct
        and (breakout or pullback_recovery)
        and stop is not None
        and rr is not None
        and rr >= r.min_risk_reward
        and confidence >= r.min_confidence
    )
    if confidence < r.min_confidence:
        reasons_against.append(f"Confidence {confidence} below {r.min_confidence}")

    signal_type = SignalType.ENTRY if all_conditions else SignalType.AVOID
    return Signal(
        asset=asset,
        signal_type=signal_type,
        direction=Direction.LONG,
        entry=close,
        stop=stop,
        target=target,
        confidence=confidence,
        strategy=STRATEGY_NAME,
        data_sources=data_sources,
        reasons_for=reasons_for,
        reasons_against=reasons_against,
        timestamp=timestamp,
    )


def score_confidence(
    bar: pd.Series, close: float, breakout: bool, pullback: bool, cfg: Config
) -> int:
    """0-100 confidence built from trend quality, not hope.

    Base 40 for intact trend structure, plus increments for each
    supporting condition. A signal physically cannot reach the 70
    threshold unless trend, volume, volatility, and a setup all align.
    """
    r = cfg.risk
    score = 0
    if (
        close > bar["sma_fast"]
        and close > bar["sma_slow"]
        and bar["sma_fast"] > bar["sma_slow"]
    ):
        score += 40
        # MA separation as trend-strength bonus (up to 10)
        sep_pct = (bar["sma_fast"] - bar["sma_slow"]) / bar["sma_slow"] * 100.0
        score += min(10, int(sep_pct))
    if bar["volume"] > bar["vol_ma"]:
        score += 10
    if r.min_atr_pct <= bar["atr_pct"] <= r.max_atr_pct:
        score += 10
    if breakout:
        score += 15
    elif pullback:
        score += 12
    if bar["dollar_vol_ma"] >= r.min_dollar_volume_20d:
        score += 5
    return max(0, min(100, score))


def should_exit(df: pd.DataFrame, cfg: Config) -> Optional[str]:
    """Trend-break exit check for an open position. Returns exit reason."""
    bar = df.iloc[-1]
    if pd.isna(bar["sma_fast"]) or pd.isna(bar["sma_slow"]):
        return None
    if bar["close"] < bar["sma_fast"] and bar["sma_fast"] < bar["sma_slow"]:
        return "Trend broken: price below fast MA and fast MA below slow MA"
    if bar["atr_pct"] > cfg.risk.max_atr_pct * 1.5:
        return f"Extreme volatility: ATR {bar['atr_pct']:.1f}%"
    return None


# ----------------------------------------------------------------------
# Exit management: trailing stop, time stop, partial profit (scale-out).
# These are the asymmetry edge of a trend follower — cut losers fast, let
# winners run, and stop feeding capital to positions that go nowhere.
# ----------------------------------------------------------------------

def compute_trailing_stop(
    df: pd.DataFrame, cfg: Config, current_stop: float
) -> float:
    """Chandelier trailing stop: highest high over the lookback minus a
    multiple of ATR. The stop only ever RATCHETS UP (never loosens) and is
    kept strictly below the latest close so it cannot trigger instantly.
    Returns the (possibly unchanged) stop."""
    p = cfg.strategy.trend_following
    if not p.use_trailing_stop or len(df) < p.trail_lookback:
        return current_stop
    bar = df.iloc[-1]
    if pd.isna(bar["atr"]):
        return current_stop
    chandelier = (
        float(df["high"].tail(p.trail_lookback).max())
        - p.trail_atr_multiple * float(bar["atr"])
    )
    new_stop = max(current_stop, chandelier)
    # Never sit at or above price; leave a small gap below the close.
    ceiling = float(bar["close"]) * 0.999
    return min(new_stop, ceiling) if new_stop > current_stop else current_stop


def time_stop_reason(
    bars_held: int, entry_price: float, current_price: float, cfg: Config
) -> Optional[str]:
    """Exit a position that has consumed its time budget without working.
    Dead capital is a real cost — a flat position blocks a better one."""
    p = cfg.strategy.trend_following
    if p.max_holding_days <= 0 or bars_held < p.max_holding_days:
        return None
    gain = (current_price / entry_price - 1) * 100.0 if entry_price > 0 else 0.0
    if gain < p.time_stop_min_gain_pct:
        return (
            f"Time stop: held {bars_held} bars, gain {gain:+.1f}% below "
            f"{p.time_stop_min_gain_pct:.1f}% threshold"
        )
    return None


def scale_out_units(
    entry_price: float,
    size: float,
    dollar_risk: float,
    current_price: float,
    cfg: Config,
    already_scaled: bool,
) -> float:
    """Units to sell as a partial profit-take at the configured R multiple.
    Returns 0.0 when scaling is disabled, already done, or not yet reached.
    Taking money off the table at +Nr de-risks the position while letting
    the remainder ride the trend behind a breakeven stop."""
    p = cfg.strategy.trend_following
    if not p.scale_out_enabled or already_scaled or size <= 0:
        return 0.0
    risk_per_unit = dollar_risk / size if size else 0.0
    if risk_per_unit <= 0:
        return 0.0
    trigger = entry_price + p.scale_out_r * risk_per_unit
    if current_price >= trigger:
        return size * p.scale_out_fraction
    return 0.0
