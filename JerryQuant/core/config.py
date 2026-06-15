"""Configuration loading and validation for JerryQuant.

All config is validated through pydantic. Hard safety floors live here as
validators: a config file cannot loosen them past the absolute limits no
matter what is typed into config.yaml.
"""

from __future__ import annotations

import enum
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator


class Mode(str, enum.Enum):
    BACKTEST = "BACKTEST"
    PAPER = "PAPER"
    LIVE_REVIEW = "LIVE_REVIEW"
    LIVE_APPROVED = "LIVE_APPROVED"


# Absolute ceilings. config.yaml may be stricter, never looser.
HARD_MAX_RISK_PER_TRADE_PCT = 2.0
HARD_MAX_TOTAL_DRAWDOWN_PCT = 15.0
HARD_MAX_OPEN_POSITIONS = 5
HARD_MIN_RISK_REWARD = 1.5
HARD_MIN_CONFIDENCE = 60


class AccountConfig(BaseModel):
    starting_equity_usd: float = Field(gt=0)
    base_currency: str = "USD"


class WatchlistConfig(BaseModel):
    crypto: list[str] = Field(default_factory=list)
    equities: list[str] = Field(default_factory=list)

    @property
    def all_assets(self) -> list[str]:
        return list(self.crypto) + list(self.equities)


class CorrelationConfig(BaseModel):
    """Correlation-aware exposure. Three crypto names that move together
    are one bet, not three — cluster caps and a sizing haircut stop the
    portfolio from quietly concentrating risk."""

    enabled: bool = True
    clusters: dict[str, list[str]] = Field(
        default_factory=lambda: {
            "crypto": ["BTC", "ETH", "SOL"],
            "crypto_etf": ["IBIT", "ETHA"],
            "equity_index": ["SPY", "QQQ", "IWM"],
        }
    )
    max_cluster_pct: float = Field(default=50.0, gt=0, le=100)
    haircut_threshold: float = Field(default=0.6, ge=0, le=1)
    max_haircut: float = Field(default=0.5, ge=0, lt=1)
    lookback_days: int = Field(default=60, ge=20)


class RiskConfig(BaseModel):
    max_risk_per_trade_pct: float = Field(default=1.0, gt=0)
    max_daily_drawdown_pct: float = Field(default=5.0, gt=0)
    max_total_drawdown_pct: float = Field(default=10.0, gt=0)
    max_monthly_loss_pct: float = Field(default=3.0, gt=0)
    max_single_asset_pct: float = Field(default=20.0, gt=0, le=100)
    max_crypto_allocation_pct: float = Field(default=40.0, ge=0, le=100)
    max_open_positions: int = Field(default=3, ge=1)
    min_risk_reward: float = Field(default=2.0)
    min_confidence: int = Field(default=70)
    max_spread_pct: float = Field(default=0.5, gt=0)
    min_dollar_volume_20d: float = Field(default=1_000_000, ge=0)
    max_atr_pct: float = Field(default=8.0, gt=0)
    min_atr_pct: float = Field(default=0.2, ge=0)
    correlation: CorrelationConfig = Field(default_factory=CorrelationConfig)

    @field_validator("max_risk_per_trade_pct")
    @classmethod
    def _cap_per_trade_risk(cls, v: float) -> float:
        if v > HARD_MAX_RISK_PER_TRADE_PCT:
            raise ValueError(
                f"max_risk_per_trade_pct {v} exceeds hard ceiling "
                f"{HARD_MAX_RISK_PER_TRADE_PCT}"
            )
        return v

    @field_validator("max_total_drawdown_pct")
    @classmethod
    def _cap_total_drawdown(cls, v: float) -> float:
        if v > HARD_MAX_TOTAL_DRAWDOWN_PCT:
            raise ValueError(
                f"max_total_drawdown_pct {v} exceeds hard ceiling "
                f"{HARD_MAX_TOTAL_DRAWDOWN_PCT}"
            )
        return v

    @field_validator("max_open_positions")
    @classmethod
    def _cap_open_positions(cls, v: int) -> int:
        if v > HARD_MAX_OPEN_POSITIONS:
            raise ValueError(
                f"max_open_positions {v} exceeds hard ceiling "
                f"{HARD_MAX_OPEN_POSITIONS}"
            )
        return v

    @field_validator("min_risk_reward")
    @classmethod
    def _floor_risk_reward(cls, v: float) -> float:
        if v < HARD_MIN_RISK_REWARD:
            raise ValueError(
                f"min_risk_reward {v} is below hard floor {HARD_MIN_RISK_REWARD}"
            )
        return v

    @field_validator("min_confidence")
    @classmethod
    def _floor_confidence(cls, v: int) -> int:
        if v < HARD_MIN_CONFIDENCE:
            raise ValueError(
                f"min_confidence {v} is below hard floor {HARD_MIN_CONFIDENCE}"
            )
        return v


class TrendFollowingConfig(BaseModel):
    enabled: bool = True
    fast_ma: int = 50
    slow_ma: int = 200
    volume_ma: int = 20
    atr_period: int = 14
    atr_stop_multiple: float = 2.0
    pullback_lookback: int = 10

    # --- exit management (capture fat-tailed winners, cut dead capital) ---
    use_trailing_stop: bool = True
    trail_atr_multiple: float = 3.0     # chandelier: high - mult*ATR
    trail_lookback: int = 22            # bars for the chandelier high
    max_holding_days: int = 90          # time stop; 0 disables
    time_stop_min_gain_pct: float = 2.0  # exit at time stop only if gain below this
    scale_out_enabled: bool = True
    scale_out_r: float = 1.5            # take partial profit at this R multiple
    scale_out_fraction: float = 0.5     # fraction of the position to sell
    breakeven_after_scale: bool = True  # ratchet stop to entry after scaling out

    @model_validator(mode="after")
    def _ma_order(self) -> "TrendFollowingConfig":
        if self.fast_ma >= self.slow_ma:
            raise ValueError("fast_ma must be shorter than slow_ma")
        if not 0.0 < self.scale_out_fraction < 1.0:
            raise ValueError("scale_out_fraction must be between 0 and 1")
        if self.trail_atr_multiple <= 0:
            raise ValueError("trail_atr_multiple must be positive")
        return self


class MomentumConfig(BaseModel):
    enabled: bool = False


class RegimeConfig(BaseModel):
    """Market-regime gate. Trend-following bleeds in bear/chop tapes, so
    new longs are only allowed when the broad market is itself healthy."""

    enabled: bool = True
    benchmark: str = "SPY"
    benchmark_ma: int = Field(default=200, ge=20)
    require_benchmark_uptrend: bool = True
    min_breadth_pct: float = Field(default=40.0, ge=0, le=100)
    breadth_ma: int = Field(default=200, ge=20)
    max_benchmark_atr_pct: float = Field(default=0.0, ge=0)  # 0 disables vol gate


class RotationConfig(BaseModel):
    """Always-invested momentum rotation: hold the strongest asset, rotate
    when another overtakes it, and step to a defensive asset (T-bills/cash)
    only when the whole pool is weaker than cash. Stop-loss / take-profit are
    available but default OFF — backtests show the cash filter protects better
    and the extras mostly cost return (stop-loss whipsaws)."""

    enabled: bool = False
    rotation_assets: list[str] = Field(default_factory=lambda: ["SPY", "QQQ"])
    defensive_asset: str = "BIL"        # T-bill ETF = "cash" leg; never literally flat
    lookback_days: int = Field(default=63, ge=20)   # ~3-month momentum
    top_n: int = Field(default=1, ge=1)
    rebalance: str = "monthly"          # monthly | weekly
    use_stop_loss: bool = False
    stop_loss_pct: float = Field(default=10.0, gt=0, le=50)
    use_take_profit: bool = False
    take_profit_pct: float = Field(default=15.0, gt=0, le=100)


class StrategyConfig(BaseModel):
    active: str = "trend_following"     # trend_following | rotation
    trend_following: TrendFollowingConfig = TrendFollowingConfig()
    momentum: MomentumConfig = MomentumConfig()
    regime: RegimeConfig = RegimeConfig()
    rotation: RotationConfig = RotationConfig()


class SignalsConfig(BaseModel):
    sentiment_max_confidence_adjust: int = Field(default=10, ge=0, le=15)
    prediction_market_max_confidence_adjust: int = Field(default=10, ge=0, le=15)


class DataConfig(BaseModel):
    provider: str = "yfinance"
    history_days: int = Field(default=400, ge=250)
    max_staleness_hours_equity: float = Field(default=30, gt=0)
    max_staleness_hours_crypto: float = Field(default=3, gt=0)
    crypto_quote: str = "USD"


class CostsConfig(BaseModel):
    fee_pct: float = Field(default=0.10, ge=0)
    slippage_pct: float = Field(default=0.05, ge=0)
    spread_pct: float = Field(default=0.05, ge=0)


class BacktestConfig(CostsConfig):
    start_date: str = "2020-01-01"
    end_date: Optional[str] = None


class ExecutionConfig(BaseModel):
    require_manual_approval: bool = True
    live_trading_enabled: bool = False
    halt_file: str = "HALT_TRADING.txt"
    # Order pricing. Robinhood only accepts MARKET orders for fractional
    # shares, so a true marketable-limit order can only be used once a
    # position is a whole share or more; fractional orders fall back to
    # market protected by a pre-trade price-deviation guard.
    use_marketable_limit: bool = True
    limit_buffer_pct: float = Field(default=0.25, ge=0, le=5)
    max_buy_deviation_pct: float = Field(default=1.5, gt=0, le=20)

    @field_validator("require_manual_approval")
    @classmethod
    def _approval_is_mandatory(cls, v: bool) -> bool:
        if not v:
            raise ValueError(
                "require_manual_approval cannot be disabled. Manual approval "
                "of every live trade is a non-negotiable safety rule."
            )
        return v


class DatabaseConfig(BaseModel):
    path: str = "jerryquant.db"


class EmailConfig(BaseModel):
    enabled: bool = True
    recipient: str = ""


class ReportingConfig(BaseModel):
    output_dir: str = "logs/reports"
    email: EmailConfig = EmailConfig()


class LoggingConfig(BaseModel):
    level: str = "INFO"
    dir: str = "logs"


class Config(BaseModel):
    mode: Mode = Mode.BACKTEST
    account: AccountConfig
    watchlist: WatchlistConfig
    risk: RiskConfig = RiskConfig()
    strategy: StrategyConfig = StrategyConfig()
    signals: SignalsConfig = SignalsConfig()
    data: DataConfig = DataConfig()
    backtest: BacktestConfig = BacktestConfig()
    paper: CostsConfig = CostsConfig()
    execution: ExecutionConfig = ExecutionConfig()
    database: DatabaseConfig = DatabaseConfig()
    reporting: ReportingConfig = ReportingConfig()
    logging: LoggingConfig = LoggingConfig()

    def is_crypto(self, asset: str) -> bool:
        return asset.upper() in {a.upper() for a in self.watchlist.crypto}


def load_config(path: str | Path = "config.yaml") -> Config:
    """Load and validate config.yaml. Raises on any invalid or unsafe value."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path, "r") as f:
        raw = yaml.safe_load(f) or {}
    return Config(**raw)
