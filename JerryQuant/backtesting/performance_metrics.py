"""Performance metrics for backtests and paper trading."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

from database.models import Trade

TRADING_DAYS_PER_YEAR = 252


@dataclass
class PerformanceReport:
    total_return_pct: float
    annualized_return_pct: float
    max_drawdown_pct: float
    win_rate_pct: float
    average_win: float
    average_loss: float
    profit_factor: float
    sharpe_ratio: float
    sortino_ratio: float
    num_trades: int
    avg_holding_days: float
    worst_trade: float
    best_trade: float
    max_consecutive_losses: int
    buy_hold_return_pct: Optional[float]
    final_equity: float

    def render(self) -> str:
        bh = (
            f"{self.buy_hold_return_pct:+.2f}%"
            if self.buy_hold_return_pct is not None
            else "n/a"
        )
        rows = [
            ("Total return", f"{self.total_return_pct:+.2f}%"),
            ("Annualized return", f"{self.annualized_return_pct:+.2f}%"),
            ("Buy & hold return", bh),
            ("Max drawdown", f"{self.max_drawdown_pct:.2f}%"),
            ("Win rate", f"{self.win_rate_pct:.1f}%"),
            ("Average win", f"${self.average_win:,.2f}"),
            ("Average loss", f"${self.average_loss:,.2f}"),
            ("Profit factor", f"{self.profit_factor:.2f}"),
            ("Sharpe ratio", f"{self.sharpe_ratio:.2f}"),
            ("Sortino ratio", f"{self.sortino_ratio:.2f}"),
            ("Trades", str(self.num_trades)),
            ("Avg holding (days)", f"{self.avg_holding_days:.1f}"),
            ("Best trade", f"${self.best_trade:,.2f}"),
            ("Worst trade", f"${self.worst_trade:,.2f}"),
            ("Max consecutive losses", str(self.max_consecutive_losses)),
            ("Final equity", f"${self.final_equity:,.2f}"),
        ]
        width = max(len(k) for k, _ in rows)
        return "\n".join(f"  {k.ljust(width)}  {v}" for k, v in rows)


def compute_metrics(
    trades: list[Trade],
    equity_curve: pd.Series,
    buy_hold_return_pct: Optional[float] = None,
) -> PerformanceReport:
    """equity_curve: daily equity indexed by date, starting at initial equity."""
    if equity_curve.empty:
        raise ValueError("Equity curve is empty")

    start_equity = float(equity_curve.iloc[0])
    final_equity = float(equity_curve.iloc[-1])
    total_return = (final_equity / start_equity - 1) * 100.0

    n_days = len(equity_curve)
    years = n_days / TRADING_DAYS_PER_YEAR
    if years > 0 and final_equity > 0:
        annualized = ((final_equity / start_equity) ** (1 / years) - 1) * 100.0
    else:
        annualized = 0.0

    running_max = equity_curve.cummax()
    drawdowns = (equity_curve - running_max) / running_max
    max_dd = abs(float(drawdowns.min())) * 100.0

    daily_returns = equity_curve.pct_change().dropna()
    if len(daily_returns) > 1 and daily_returns.std() > 0:
        sharpe = float(
            daily_returns.mean() / daily_returns.std() * np.sqrt(TRADING_DAYS_PER_YEAR)
        )
    else:
        sharpe = 0.0
    downside = daily_returns[daily_returns < 0]
    if len(downside) > 1 and downside.std() > 0:
        sortino = float(
            daily_returns.mean() / downside.std() * np.sqrt(TRADING_DAYS_PER_YEAR)
        )
    else:
        sortino = 0.0

    pnls = [t.pnl for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    win_rate = len(wins) / len(pnls) * 100.0 if pnls else 0.0
    avg_win = float(np.mean(wins)) if wins else 0.0
    avg_loss = float(np.mean(losses)) if losses else 0.0
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else (
        float("inf") if gross_profit > 0 else 0.0
    )

    max_consec = consec = 0
    for p in pnls:
        consec = consec + 1 if p <= 0 else 0
        max_consec = max(max_consec, consec)

    return PerformanceReport(
        total_return_pct=total_return,
        annualized_return_pct=annualized,
        max_drawdown_pct=max_dd,
        win_rate_pct=win_rate,
        average_win=avg_win,
        average_loss=avg_loss,
        profit_factor=profit_factor,
        sharpe_ratio=sharpe,
        sortino_ratio=sortino,
        num_trades=len(trades),
        avg_holding_days=(
            float(np.mean([t.holding_days for t in trades])) if trades else 0.0
        ),
        worst_trade=min(pnls) if pnls else 0.0,
        best_trade=max(pnls) if pnls else 0.0,
        max_consecutive_losses=max_consec,
        buy_hold_return_pct=buy_hold_return_pct,
        final_equity=final_equity,
    )
