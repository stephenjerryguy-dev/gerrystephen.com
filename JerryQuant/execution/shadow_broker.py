"""Shadow execution: a full-autonomy dry run against a simulated ledger.

JerryQuant has never filled a live order. This lets it run completely
unattended — deciding and "executing" its own trades every morning with no
approval step — while risking nothing, so the question "can it be trusted to
trade by itself?" gets answered with evidence instead of opinion.

Two properties matter more than anything else here:

1. IT CANNOT REACH A VENUE. This class holds no credentials, imports no HTTP
   client, and has no order path. Autonomy is safe here because the venue is
   absent, not because a flag is set — a flag can be flipped by mistake.
2. IT CANNOT SEE THE FUTURE. Orders decided before the open are recorded as
   PENDING and filled later at that session's actual opening print. Filling at
   the price the decision was made on would quietly hand the shadow a few
   basis points of free money every day and flatter the whole experiment.

Slippage and commission are modelled so the shadow's edge is not an artifact
of frictionless arithmetic.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

# Robinhood charges no commission on equities; the real cost is crossing the
# spread. A few bps on a market order at the open is a conservative stand-in.
DEFAULT_SLIPPAGE_BPS = 5.0

SHADOW_STATE_KEY = "shadow_portfolio"


@dataclass
class ShadowFill:
    symbol: str
    side: str            # "buy" | "sell"
    units: float
    price: float
    filled_at: str
    strategy: str
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


@dataclass
class ShadowPortfolio:
    cash: float
    positions: dict[str, dict] = field(default_factory=dict)
    pending: list[dict] = field(default_factory=list)
    fills: list[dict] = field(default_factory=list)
    started_at: Optional[str] = None
    starting_equity: float = 0.0

    @classmethod
    def from_dict(cls, blob: dict) -> "ShadowPortfolio":
        return cls(
            cash=float(blob.get("cash", 0.0)),
            positions=dict(blob.get("positions") or {}),
            pending=list(blob.get("pending") or []),
            fills=list(blob.get("fills") or []),
            started_at=blob.get("started_at"),
            starting_equity=float(blob.get("starting_equity", 0.0)),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "cash": self.cash, "positions": self.positions,
            "pending": self.pending, "fills": self.fills,
            "started_at": self.started_at,
            "starting_equity": self.starting_equity,
        }

    def units_of(self, symbol: str) -> float:
        return float(self.positions.get(symbol, {}).get("units", 0.0))

    def equity(self, prices: dict[str, float]) -> float:
        """Mark to market. Positions without a price are held at cost rather
        than dropped, so a missing quote cannot silently shrink equity."""
        total = self.cash
        for symbol, position in self.positions.items():
            units = float(position.get("units", 0.0))
            price = prices.get(symbol) or float(position.get("avg_price", 0.0))
            total += units * price
        return total


class ShadowBroker:
    """Broker-shaped, but every order lands in a ledger instead of a venue.

    Deliberately mirrors the real broker's method names so the same decision
    code drives both — if the strategy layer needed special-casing to run in
    shadow, the shadow would no longer be testing the real thing.
    """

    def __init__(self, portfolio: ShadowPortfolio,
                 reference_broker: Optional[Any] = None,
                 slippage_bps: float = DEFAULT_SLIPPAGE_BPS):
        self.portfolio = portfolio
        # Used ONLY for read-only lookups the simulation cannot invent, such as
        # whether a paste.trade symbol is genuinely tradable and fractionable.
        self.reference_broker = reference_broker
        self.slippage_bps = slippage_bps

    # --- account shape (what the strategy layer reads) ---

    def get_balance(self) -> float:
        return self.portfolio.equity(self._last_prices())

    def get_buying_power(self) -> float:
        return self.portfolio.cash

    def get_live_positions(self) -> dict[str, dict]:
        """Mirrors the real broker: quantity plus settled-sellable. The shadow
        applies the same T+1 rule, because a strategy that only works when
        proceeds are instantly reusable is not one you can run for real."""
        today = datetime.now(timezone.utc).date().isoformat()
        out: dict[str, dict] = {}
        for symbol, position in self.portfolio.positions.items():
            units = float(position.get("units", 0.0))
            if units <= 0:
                continue
            bought_today = str(position.get("last_buy_date", "")) == today
            out[symbol] = {
                "quantity": units,
                "sellable": 0.0 if bought_today else units,
            }
        return out

    def get_tradability(self, symbols: list[str]) -> dict[str, dict]:
        if self.reference_broker is None:
            raise RuntimeError(
                "shadow broker has no reference broker for tradability; "
                "refusing to assume a symbol is tradable")
        return self.reference_broker.get_tradability(symbols)

    def _last_prices(self) -> dict[str, float]:
        return {s: float(p.get("last_price", p.get("avg_price", 0.0)))
                for s, p in self.portfolio.positions.items()}

    # --- order intake: queued, never filled at the decision price ---

    def place_order(self, signal, units: float, manually_approved: bool) -> dict:
        return self._queue("buy", signal.asset, units,
                           getattr(signal, "strategy", "") or "")

    def sell_position(self, symbol: str, units: float,
                      manually_approved: bool) -> dict:
        return self._queue("sell", symbol, units, "")

    def _queue(self, side: str, symbol: str, units: float,
               strategy: str) -> dict:
        if units <= 0:
            raise ValueError(f"shadow {side} {symbol}: non-positive units")
        order = {
            "side": side, "symbol": symbol.upper(), "units": float(units),
            "strategy": strategy,
            "queued_at": datetime.now(timezone.utc).isoformat(),
        }
        self.portfolio.pending.append(order)
        return {"status": "queued_shadow", "order": order}

    # --- settlement at the next opening print ---

    def fill_pending(self, opens: dict[str, float]) -> tuple[list[ShadowFill], list[str]]:
        """Fill queued orders at the session's opening price.

        Orders whose symbol has no opening price stay pending rather than being
        filled at a guessed price — an unfillable order in the shadow should
        look like an unfillable order in reality.
        """
        filled: list[ShadowFill] = []
        notes: list[str] = []
        still_pending: list[dict] = []
        now = datetime.now(timezone.utc)
        today = now.date().isoformat()

        for order in self.portfolio.pending:
            symbol = order["symbol"]
            open_price = opens.get(symbol)
            if not open_price or open_price <= 0:
                still_pending.append(order)
                notes.append(f"{symbol}: no opening price yet — still pending")
                continue
            slip = open_price * (self.slippage_bps / 10_000.0)
            units = float(order["units"])
            if order["side"] == "buy":
                price = open_price + slip        # pay up when buying
                cost = price * units
                if cost > self.portfolio.cash + 1e-9:
                    affordable = self.portfolio.cash / price if price > 0 else 0.0
                    if affordable <= 1e-9:
                        notes.append(
                            f"{symbol}: insufficient shadow cash "
                            f"(${self.portfolio.cash:,.2f}) — order dropped")
                        continue
                    notes.append(
                        f"{symbol}: only ${self.portfolio.cash:,.2f} cash, "
                        f"filled {affordable:.6f} of {units:.6f} units")
                    units, cost = affordable, self.portfolio.cash
                self.portfolio.cash -= cost
                position = self.portfolio.positions.setdefault(
                    symbol, {"units": 0.0, "avg_price": 0.0})
                prior_units = float(position["units"])
                prior_cost = prior_units * float(position["avg_price"])
                position["units"] = prior_units + units
                position["avg_price"] = (
                    (prior_cost + cost) / position["units"]
                    if position["units"] > 0 else price)
                position["last_price"] = open_price
                position["last_buy_date"] = today
                position["strategy"] = order.get("strategy") or position.get("strategy", "")
            else:
                price = open_price - slip        # get hit when selling
                held = self.portfolio.units_of(symbol)
                if held <= 1e-9:
                    notes.append(f"{symbol}: nothing held in shadow — sell dropped")
                    continue
                units = min(units, held)
                self.portfolio.cash += price * units
                position = self.portfolio.positions[symbol]
                position["units"] = held - units
                position["last_price"] = open_price
                if position["units"] <= 1e-9:
                    self.portfolio.positions.pop(symbol, None)

            fill = ShadowFill(symbol=symbol, side=order["side"], units=units,
                              price=price, filled_at=now.isoformat(),
                              strategy=order.get("strategy", ""))
            filled.append(fill)
            self.portfolio.fills.append(fill.to_dict())

        self.portfolio.pending = still_pending
        return filled, notes


def load_portfolio(db, starting_cash: float) -> ShadowPortfolio:
    """Read the shadow ledger, seeding it on first run so the experiment has a
    fixed, honest starting line to be measured against."""
    blob = db.get_shadow_state()
    if blob:
        return ShadowPortfolio.from_dict(blob)
    now = datetime.now(timezone.utc).isoformat()
    return ShadowPortfolio(cash=starting_cash, started_at=now,
                           starting_equity=starting_cash)


def save_portfolio(db, portfolio: ShadowPortfolio) -> None:
    db.save_shadow_state(portfolio.to_dict())
