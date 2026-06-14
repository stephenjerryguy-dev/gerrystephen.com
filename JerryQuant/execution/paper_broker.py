"""Paper broker.

Simulates fills with slippage, spread, and fees so paper results are
honest. Every order is blocked by the kill switch exactly as a live order
would be, and every fill is journaled with the same fields as a real trade.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from core.config import Config
from database.models import Direction, Position, Signal, Trade
from risk.kill_switch import KillSwitch


class OrderRejected(Exception):
    pass


class PaperBroker:
    def __init__(self, cfg: Config, kill_switch: KillSwitch,
                 starting_cash: Optional[float] = None):
        self.cfg = cfg
        self.kill_switch = kill_switch
        self.cash = (
            starting_cash if starting_cash is not None
            else cfg.account.starting_equity_usd
        )
        self.positions: dict[str, Position] = {}
        self._entry_fees: dict[str, float] = {}
        self.closed_trades: list[Trade] = []

    # --- account ---

    def get_balance(self) -> float:
        return self.cash

    def equity(self, prices: dict[str, float]) -> float:
        return self.cash + sum(
            p.value(prices.get(p.asset, p.entry_price))
            for p in self.positions.values()
        )

    # --- fills ---

    def _entry_fill(self, price: float) -> float:
        c = self.cfg.paper
        return price * (1 + (c.slippage_pct + c.spread_pct / 2) / 100.0)

    def _exit_fill(self, price: float) -> float:
        c = self.cfg.paper
        return price * (1 - (c.slippage_pct + c.spread_pct / 2) / 100.0)

    def _fee(self, notional: float) -> float:
        return notional * self.cfg.paper.fee_pct / 100.0

    # --- orders ---

    def open_long(self, signal: Signal, size_units: float,
                  market_price: float) -> Position:
        """Open a simulated long. Raises on any blocked condition."""
        self.kill_switch.assert_can_trade()
        asset = signal.asset
        if asset in self.positions:
            raise OrderRejected(f"Position already open in {asset}")
        if size_units <= 0:
            raise OrderRejected(f"Invalid size {size_units}")
        if signal.stop is None or signal.target is None:
            raise OrderRejected("Order requires both stop and target")

        fill = self._entry_fill(market_price)
        cost = size_units * fill
        fee = self._fee(cost)
        if cost + fee > self.cash:
            raise OrderRejected(
                f"Insufficient cash: need ${cost + fee:,.2f}, have ${self.cash:,.2f}"
            )

        # Re-anchor stop/target to the actual fill, preserving R distance.
        risk_per_unit = signal.entry - signal.stop
        stop = fill - risk_per_unit
        target = fill + self.cfg.risk.min_risk_reward * risk_per_unit
        if stop <= 0:
            raise OrderRejected("Stop became invalid after slippage adjustment")

        self.cash -= cost + fee
        pos = Position(
            asset=asset,
            direction=Direction.LONG,
            size=size_units,
            entry_price=fill,
            stop=stop,
            target=target,
            opened_at=datetime.now(timezone.utc),
            strategy=signal.strategy,
            dollar_risk=size_units * risk_per_unit,
        )
        self.positions[asset] = pos
        self._entry_fees[asset] = fee
        return pos

    def close_long(self, asset: str, market_price: float, exit_reason: str,
                   signal: Optional[Signal] = None) -> Trade:
        if asset not in self.positions:
            raise OrderRejected(f"No open position in {asset}")
        pos = self.positions.pop(asset)
        entry_fee = self._entry_fees.pop(asset, 0.0)

        fill = self._exit_fill(market_price)
        proceeds = pos.size * fill
        exit_fee = self._fee(proceeds)
        self.cash += proceeds - exit_fee

        total_fees = entry_fee + exit_fee
        pnl = (fill - pos.entry_price) * pos.size - total_fees
        trade = Trade(
            asset=asset,
            direction=pos.direction,
            size=pos.size,
            entry_price=pos.entry_price,
            exit_price=fill,
            stop=pos.stop,
            target=pos.target,
            dollar_risk=pos.dollar_risk,
            confidence=signal.confidence if signal else 0,
            strategy=pos.strategy,
            data_sources=signal.data_sources if signal else [self.cfg.data.provider],
            reasoning=exit_reason,
            opened_at=pos.opened_at,
            closed_at=datetime.now(timezone.utc),
            exit_reason=exit_reason,
            fees=total_fees,
            pnl=pnl,
        )
        self.closed_trades.append(trade)
        return trade

    def scale_out_long(self, asset: str, units: float, market_price: float,
                       exit_reason: str = "Scale-out: partial profit") -> Trade:
        """Sell part of a position, banking profit while it stays open. Mirrors
        the live broker's partial sell so paper and live behave identically."""
        if asset not in self.positions:
            raise OrderRejected(f"No open position in {asset}")
        pos = self.positions[asset]
        units = min(units, pos.size)
        if units <= 0:
            raise OrderRejected(f"Invalid scale-out size {units}")
        frac = units / pos.size

        fill = self._exit_fill(market_price)
        proceeds = units * fill
        exit_fee = self._fee(proceeds)
        self.cash += proceeds - exit_fee
        entry_fee_part = self._entry_fees.get(asset, 0.0) * frac
        self._entry_fees[asset] = self._entry_fees.get(asset, 0.0) * (1 - frac)

        pnl = (fill - pos.entry_price) * units - entry_fee_part - exit_fee
        trade = Trade(
            asset=asset, direction=pos.direction, size=units,
            entry_price=pos.entry_price, exit_price=fill, stop=pos.stop,
            target=pos.target, dollar_risk=pos.dollar_risk * frac, confidence=0,
            strategy=pos.strategy, data_sources=[self.cfg.data.provider],
            reasoning=exit_reason, opened_at=pos.opened_at,
            closed_at=datetime.now(timezone.utc), exit_reason=exit_reason,
            fees=entry_fee_part + exit_fee, pnl=pnl,
        )
        pos.size -= units
        pos.dollar_risk *= (1 - frac)
        if self.cfg.strategy.trend_following.breakeven_after_scale:
            pos.stop = max(pos.stop, pos.entry_price)
        self.closed_trades.append(trade)
        return trade

    def check_stops_and_targets(
        self, prices: dict[str, float]
    ) -> list[Trade]:
        """Close any position whose stop or target is breached at current prices."""
        closed = []
        for asset in list(self.positions.keys()):
            price = prices.get(asset)
            if price is None:
                continue
            pos = self.positions[asset]
            if price <= pos.stop:
                closed.append(self.close_long(asset, price, "Stop loss hit"))
            elif price >= pos.target:
                closed.append(self.close_long(asset, price, "Take profit hit"))
        return closed
