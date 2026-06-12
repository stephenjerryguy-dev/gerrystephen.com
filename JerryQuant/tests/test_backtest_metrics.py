from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from backtesting.backtest_engine import run_backtest
from backtesting.performance_metrics import compute_metrics
from database.models import Direction, Trade
from tests.conftest import make_config, trending_with_breakouts_df


def make_trade(pnl: float, days_held: int = 5) -> Trade:
    opened = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return Trade(
        asset="TEST",
        direction=Direction.LONG,
        size=1.0,
        entry_price=100.0,
        exit_price=100.0 + pnl,
        stop=95.0,
        target=110.0,
        dollar_risk=5.0,
        confidence=80,
        strategy="test",
        data_sources=["test"],
        reasoning="test",
        opened_at=opened,
        closed_at=opened + timedelta(days=days_held),
        exit_reason="test",
        pnl=pnl,
    )


def flat_equity_curve(start=1000.0, days=252):
    idx = pd.bdate_range("2026-01-01", periods=days)
    return pd.Series([start] * days, index=idx, dtype=float)


def test_metrics_on_known_trades():
    trades = [make_trade(10), make_trade(10), make_trade(-5), make_trade(-5)]
    idx = pd.bdate_range("2026-01-01", periods=4)
    curve = pd.Series([1000.0, 1010.0, 1020.0, 1010.0], index=idx)

    report = compute_metrics(trades, curve, buy_hold_return_pct=5.0)
    assert report.num_trades == 4
    assert report.win_rate_pct == pytest.approx(50.0)
    assert report.average_win == pytest.approx(10.0)
    assert report.average_loss == pytest.approx(-5.0)
    assert report.profit_factor == pytest.approx(2.0)
    assert report.best_trade == pytest.approx(10.0)
    assert report.worst_trade == pytest.approx(-5.0)
    assert report.max_consecutive_losses == 2
    assert report.avg_holding_days == pytest.approx(5.0)
    assert report.buy_hold_return_pct == pytest.approx(5.0)
    assert report.total_return_pct == pytest.approx(1.0)


def test_max_drawdown_from_curve():
    idx = pd.bdate_range("2026-01-01", periods=5)
    curve = pd.Series([1000.0, 1100.0, 990.0, 1050.0, 1080.0], index=idx)
    report = compute_metrics([], curve)
    assert report.max_drawdown_pct == pytest.approx(10.0)


def test_no_trades_yields_zeroed_trade_stats():
    report = compute_metrics([], flat_equity_curve())
    assert report.num_trades == 0
    assert report.win_rate_pct == 0.0
    assert report.profit_factor == 0.0
    assert report.total_return_pct == pytest.approx(0.0)


def test_backtest_engine_runs_and_trades():
    cfg = make_config(
        watchlist={"crypto": [], "equities": ["TEST"]},
    )
    data = {"TEST": trending_with_breakouts_df()}
    result = run_backtest(data, cfg)

    assert len(result.equity_curve) > 0
    assert result.report.num_trades >= 1
    # Risk discipline: no single trade may lose more than ~1% of starting
    # equity (small tolerance for slippage/fees beyond the stop).
    start = cfg.account.starting_equity_usd
    for t in result.trades:
        assert t.pnl >= -start * 0.015
    # Equity curve must start at configured equity.
    assert result.equity_curve.iloc[0] == pytest.approx(start, rel=0.01)


def test_backtest_no_lookahead_warmup():
    """No trades may open before the 200-day MA warmup completes."""
    cfg = make_config(watchlist={"crypto": [], "equities": ["TEST"]})
    df = trending_with_breakouts_df()
    result = run_backtest({"TEST": df}, cfg)
    warmup_end = df.index[cfg.strategy.trend_following.slow_ma]
    for t in result.trades:
        assert t.opened_at.date() > warmup_end.date()
