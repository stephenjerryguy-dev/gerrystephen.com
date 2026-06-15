"""Diversified target-allocation strategy (robo-advisor style).

Hold a fixed multi-asset mix (stocks / small-cap / gold / bonds, crypto
optional) and rebalance back to target weights only when a holding drifts
past a band. Diversification is the risk control: when stocks fall, bonds
and gold usually cushion the blow, so unlike the rotation strategy there is
no market-timing cash exit. Low turnover, always invested, hands-light.

Pure decision logic over current dollar values — shared by backtest and the
live agent, easy to test.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from core.config import Config


@dataclass
class RebalanceTrade:
    symbol: str
    side: str          # "buy" | "sell"
    dollars: float


@dataclass
class RebalancePlan:
    trades: list[RebalanceTrade] = field(default_factory=list)
    needed: bool = False
    reasons: list[str] = field(default_factory=list)


def normalized_weights(cfg: Config) -> dict[str, float]:
    w = cfg.strategy.allocation.weights
    total = sum(w.values()) or 1.0
    return {s: v / total for s, v in w.items()}


def target_dollars(equity: float, cfg: Config) -> dict[str, float]:
    """Target dollar amount per asset, after holding back a small cash buffer."""
    investable = equity * (1 - cfg.strategy.allocation.cash_buffer_pct / 100.0)
    return {s: investable * w for s, w in normalized_weights(cfg).items()}


def plan_rebalance(current_values: dict[str, float], equity: float,
                   cfg: Config) -> RebalancePlan:
    """Decide the trades to bring the portfolio back to target weights.

    `current_values` maps symbol -> current USD value held (0 if not held).
    Only rebalances when SOME asset has drifted past the band (so steady days
    do nothing), and only emits trades above min_trade_usd. Sells come before
    buys so the proceeds fund the buys (next cycle, after T+1 settlement)."""
    ac = cfg.strategy.allocation
    if equity <= 0:
        return RebalancePlan(needed=False, reasons=["no equity"])

    targets = target_dollars(equity, cfg)
    band = ac.rebalance_band_pct / 100.0 * equity

    # Drift check: does anything (target asset or stray holding) deviate enough?
    universe = set(targets) | set(current_values)
    max_drift = 0.0
    for s in universe:
        drift = abs(current_values.get(s, 0.0) - targets.get(s, 0.0))
        max_drift = max(max_drift, drift)
    if max_drift < band:
        return RebalancePlan(
            needed=False,
            reasons=[f"within band (max drift ${max_drift:,.2f} < "
                     f"${band:,.2f}) — no rebalance"],
        )

    sells, buys = [], []
    for s in sorted(universe):
        cur = current_values.get(s, 0.0)
        tgt = targets.get(s, 0.0)
        delta = tgt - cur
        if abs(delta) < ac.min_trade_usd:
            continue
        if delta < 0:
            sells.append(RebalanceTrade(s, "sell", round(-delta, 2)))
        else:
            buys.append(RebalanceTrade(s, "buy", round(delta, 2)))

    reasons = [f"drift ${max_drift:,.2f} exceeds band ${band:,.2f} — rebalancing "
               f"to targets ({len(sells)} sells, {len(buys)} buys)"]
    return RebalancePlan(trades=sells + buys, needed=bool(sells or buys),
                         reasons=reasons)
