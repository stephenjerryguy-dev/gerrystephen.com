"""Bridge routed paste.trade observations into approvable Robinhood tickets.

The honest framing, because it governs every choice below: paste.trade's board
is Hyperliquid **perps**, frequently leveraged (20x seen). The `xyz:` namespace
maps those to real US-listed underlyings, so a LONG `xyz:MU` perp can become a
1x spot MU buy — but that is a DIFFERENT TRADE than the one the author made.
Strip the leverage and the intraday horizon and you keep only the direction,
which is the weakest part of their edge. So this sleeve is:

  * long-only (no shorting, no margin, leverage forced to 1x),
  * ring-fenced to its own small copy budget, never the core portfolio,
  * loss-bounded by a mandatory stop (paste.trade supplies none, so one is
    derived from a configured % and shown on the ticket),
  * verified tradable at the account before it can ever be proposed, and
  * still subject to the same human approval as everything else.

Ranking it honestly against the other sleeves: weather (thin markets, real
edge) > systematic equity (market-matching) > this. Keep it small.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


def _env_float(name: str) -> Optional[float]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    try:
        v = float(raw)
        return v if v > 0 else None
    except ValueError:
        return None


@dataclass
class BridgeResult:
    actions: list[dict] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def max_adverse_pct() -> float:
    """How far the SOURCE's own trade may be underwater and still be copied.

    Copying is a momentum bet on someone else's read. A thesis already moving
    against its author is a weaker setup than the same call working, and the
    delay between their entry and our fill only widens that gap. Observed live:
    an AMD long sat -1.10% unlevered (-11% at the author's 10x) four hours after
    it was posted, while newer names on the board were green — it had become the
    worst idea there, yet nothing in the sizing logic could see that.
    """
    return _env_float("JERRYQUANT_COPY_MAX_ADVERSE_PCT") or 0.75


def copy_stop_pct() -> float:
    """Stop distance for copied trades. paste.trade carries no auditable stop,
    and without one you cannot bound the loss — so a configured default is
    used and disclosed on the ticket."""
    return _env_float("JERRYQUANT_COPY_STOP_PCT") or 8.0


def build_actions(tickets, broker, equity: float) -> BridgeResult:
    """Turn routed robinhood tickets into standard live action dicts.

    `tickets` are RoutedTicket objects from paste_trade_router. Anything not
    long-equity-at-robinhood is dropped with a note explaining why.
    """
    res = BridgeResult()
    budget = _env_float("JERRYQUANT_RH_COPY_BUDGET_USD")
    max_loss = _env_float("JERRYQUANT_COPY_MAX_LOSS_USD")

    rh = [t for t in tickets if getattr(t, "venue", "") == "robinhood"
          and str(getattr(t, "direction", "")).upper() == "LONG"]
    dropped = len(tickets) - len(rh)
    if dropped:
        res.notes.append(f"paste.trade: {dropped} observation(s) not "
                         f"long-equity-at-Robinhood (crypto perp / short) — skipped")
    if not rh:
        return res

    if budget is None or max_loss is None:
        res.notes.append(
            "paste.trade sleeve idle: set JERRYQUANT_RH_COPY_BUDGET_USD and "
            "JERRYQUANT_COPY_MAX_LOSS_USD to enable copy sizing")
        return res

    # Verify the symbols are actually tradable HERE before proposing anything.
    symbols = [t.symbol.upper() for t in rh]
    try:
        trad = broker.get_tradability(symbols)
    except Exception as e:
        res.notes.append(f"paste.trade: tradability check failed ({e}) — "
                         f"skipping sleeve rather than assuming")
        return res

    stop_pct = copy_stop_pct()
    per_trade_budget = budget / max(1, len(rh))

    for t in rh:
        sym = t.symbol.upper()
        info = trad.get(sym)
        if not info or not info.get("tradeable"):
            res.notes.append(f"{sym}: not tradable at this account — skipped")
            continue
        if not info.get("fractional"):
            res.notes.append(f"{sym}: not fractionable; a whole share may "
                             f"exceed the copy budget — skipped")
            continue
        price = getattr(t, "entry_reference", None)
        if not price or price <= 0:
            res.notes.append(f"{sym}: no reference price on the observation — skipped")
            continue

        # Drop a copy whose author is already losing on it.
        progress = getattr(t, "source_progress_pct", None)
        limit = max_adverse_pct()
        if progress is not None and progress < -limit:
            res.notes.append(
                f"{sym}: source is {progress:+.2f}% underwater "
                f"(limit -{limit:.2f}%) — deteriorating setup, skipped")
            continue

        stop = price * (1 - stop_pct / 100.0)
        risk_per_unit = price - stop
        # Size is the SMALLER of the budget slice and the max-loss cap.
        units_by_budget = per_trade_budget / price
        units_by_loss = max_loss / risk_per_unit if risk_per_unit > 0 else 0.0
        units = min(units_by_budget, units_by_loss)
        stake = units * price
        if units <= 0 or stake < 1.0:
            res.notes.append(f"{sym}: sized below $1 after caps — skipped")
            continue

        res.actions.append({
            "kind": "entry", "symbol": sym, "units": units,
            "entry": price, "stop": stop, "target": None,
            "dollar_risk": units * risk_per_unit, "confidence": 50,
            "strategy": "paste_copy",
            "source_progress_pct": progress,
            # Persisted so the exit manager can find the SAME source trade
            # later, rather than re-matching loosely on symbol.
            "source_trade_id": getattr(t, "trade_id", None),
            "reason": (f"copy of @{str(t.source_handle).lstrip('@')} LONG {sym} "
                       f"(source: {t.source_leverage or 1}x perp on Hyperliquid, "
                       f"taken here as 1x spot; stop {stop_pct:.0f}% = ${stop:,.2f}"
                       + (f"; source {progress:+.2f}% since entry)"
                          if progress is not None else ")")),
            "ticket": (f"BUY {sym} ~{units:.6f} @ ${price:,.2f} (~${stake:,.2f}) "
                       f"— paste.trade copy, max loss ${units * risk_per_unit:,.2f}"),
        })
    if res.actions:
        res.notes.append(
            f"paste.trade sleeve: {len(res.actions)} copy ticket(s), "
            f"budget ${budget:,.2f}, stop {stop_pct:.0f}%, leverage forced to 1x")
    return res


def exit_thresholds() -> tuple[float, float, float]:
    """(hard adverse %, minimum peak %, give-back fraction of peak)."""
    return (
        _env_float("JERRYQUANT_COPY_EXIT_ADVERSE_PCT") or 2.0,
        _env_float("JERRYQUANT_COPY_EXIT_MIN_PEAK_PCT") or 1.0,
        _env_float("JERRYQUANT_COPY_EXIT_GIVEBACK") or 0.6,
    )


def exit_actions(managed: dict, held: dict, trades) -> BridgeResult:
    """Close copies whose SOURCE thesis has broken down.

    The entry guard only screens at the moment of entry; once held, an 8% stop
    was the sole exit, which is far looser than the horizon these trades are
    actually taken on. This manages them on the author's own progress instead.

    ONE RULE MATTERS MOST, and it is a restraint rather than a trigger: a trade
    vanishing from the board is NOT an exit signal. The feed is a rolling
    same-day window (observed `window: today`, 04:00Z → now), so a name drops
    off when it ages out of that window or the day rolls — not when the author
    closes. There is no close flag in the payload. Treating absence as a close
    would liquidate healthy positions every morning, so an unseen source is
    reported and held.
    """
    res = BridgeResult()
    adverse_limit, min_peak, giveback = exit_thresholds()
    by_id = {t.trade_id: t for t in trades}
    by_symbol: dict[str, object] = {}
    for t in trades:
        if str(getattr(t, "direction", "")).upper() == "LONG":
            by_symbol.setdefault(str(t.symbol).upper(), t)

    for symbol, position in (managed or {}).items():
        if position.get("strategy") != "paste_copy":
            continue
        sellable = float((held.get(symbol) or {}).get("sellable", 0.0))
        if sellable <= 0:
            continue
        source = by_id.get(position.get("source_trade_id")) or by_symbol.get(symbol)
        if source is None:
            res.notes.append(
                f"{symbol}: source not on today's board — the feed is a "
                f"same-day window, so absence is not a close; holding")
            continue

        progress = source.current_pnl
        if progress is None:
            res.notes.append(f"{symbol}: source has no P&L figure — holding")
            continue
        peak = source.peak_pct

        reason = None
        if progress <= -adverse_limit:
            reason = (f"source thesis failing: {progress:+.2f}% "
                      f"(exit at -{adverse_limit:.2f}%)")
        elif peak is not None and peak >= min_peak and progress < peak * (1 - giveback):
            reason = (f"source gave back {(1 - progress / peak) * 100:.0f}% of a "
                      f"{peak:+.2f}% peak (now {progress:+.2f}%)")
        if reason is None:
            continue

        res.actions.append({
            "kind": "exit", "symbol": symbol, "units": sellable,
            "reference_price": source.current_price or position.get("entry_price", 0.0),
            "reason": f"close paste.trade copy — {reason}",
            "full": True, "strategy": "paste_copy",
        })
    return res
