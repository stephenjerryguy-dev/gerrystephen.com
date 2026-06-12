"""Order manager.

Builds the full trade ticket (every field a human needs to judge the
trade), runs all risk gates, and — for live modes — collects explicit
manual approval. In LIVE_REVIEW tickets are displayed and journaled but
NEVER executed. The approval prompt requires typing APPROVE verbatim;
anything else is a rejection.
"""

from __future__ import annotations

from typing import Callable, Optional

from core.config import Config, Mode
from database.models import Position, Signal, TradeTicket
from risk.exposure_limits import check_exposure, exposure_summary
from risk.kill_switch import KillSwitch
from risk.position_sizing import (
    PositionSize,
    PositionSizeError,
    calculate_position_size,
)


class TradeBlocked(Exception):
    """Raised when a risk gate blocks the trade. The message says which."""


def build_ticket(
    signal: Signal,
    equity: float,
    open_positions: list[Position],
    position_prices: dict[str, float],
    cfg: Config,
) -> tuple[TradeTicket, PositionSize]:
    """Size the trade and assemble the ticket, enforcing every risk gate.

    Raises TradeBlocked or PositionSizeError when the trade must not happen.
    PositionSizeError must be escalated to the kill switch by the caller.
    """
    r = cfg.risk
    rr = signal.risk_reward
    if signal.stop is None:
        raise TradeBlocked("No stop loss could be calculated")
    if rr is None or rr < r.min_risk_reward:
        raise TradeBlocked(f"Risk/reward {rr} below minimum {r.min_risk_reward}:1")
    if signal.confidence < r.min_confidence:
        raise TradeBlocked(
            f"Confidence {signal.confidence} below minimum {r.min_confidence}"
        )

    size = calculate_position_size(
        equity=equity,
        entry=signal.entry,
        stop=signal.stop,
        max_risk_pct=r.max_risk_per_trade_pct,
        max_position_pct=r.max_single_asset_pct,
    )

    crypto_assets = {a.upper() for a in cfg.watchlist.crypto}
    violations = check_exposure(
        candidate_asset=signal.asset,
        candidate_value_usd=size.value_usd,
        candidate_is_crypto=signal.asset.upper() in crypto_assets,
        equity=equity,
        open_positions=open_positions,
        position_prices=position_prices,
        max_open_positions=r.max_open_positions,
        max_single_asset_pct=r.max_single_asset_pct,
        max_crypto_pct=r.max_crypto_allocation_pct,
        crypto_assets=crypto_assets,
    )
    if violations:
        raise TradeBlocked("; ".join(violations))

    total_pct, crypto_pct = exposure_summary(
        equity, open_positions, position_prices, crypto_assets
    )
    ticket = TradeTicket(
        signal=signal,
        position_size=size.units,
        position_value_usd=size.value_usd,
        max_dollar_loss=size.dollar_risk,
        portfolio_equity=equity,
        open_positions=len(open_positions),
        current_exposure_pct=total_pct,
        crypto_exposure_pct=crypto_pct,
        reason_to_trade="; ".join(signal.reasons_for) or "none given",
        reason_not_to_trade="; ".join(signal.reasons_against) or "none identified",
    )
    return ticket, size


def request_manual_approval(
    ticket: TradeTicket,
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], None] = print,
) -> bool:
    """Show the full ticket and require the word APPROVE, typed exactly."""
    output_fn(ticket.render())
    output_fn(
        "\nType APPROVE to execute this trade. Anything else rejects it."
    )
    try:
        answer = input_fn("Decision: ").strip()
    except (EOFError, KeyboardInterrupt):
        return False
    return answer == "APPROVE"


def handle_live_signal(
    ticket: TradeTicket,
    cfg: Config,
    kill_switch: KillSwitch,
    execute_fn: Callable[[TradeTicket], None],
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], None] = print,
) -> str:
    """Route a ticket according to mode. Returns the outcome string.

    LIVE_REVIEW: display + journal only, never execute.
    LIVE_APPROVED: execute only with kill switch clear, the live-trading
    config flag set, AND explicit per-trade approval.
    """
    if cfg.mode == Mode.LIVE_REVIEW:
        output_fn(ticket.render())
        output_fn("\nLIVE_REVIEW mode: ticket recorded, no order placed.")
        return "reviewed"

    if cfg.mode != Mode.LIVE_APPROVED:
        return "ignored: not a live mode"

    kill_switch.assert_can_trade()
    if not cfg.execution.live_trading_enabled:
        return "blocked: live_trading_enabled is false in config.yaml"

    if not request_manual_approval(ticket, input_fn, output_fn):
        return "rejected by user"

    execute_fn(ticket)
    return "executed"
