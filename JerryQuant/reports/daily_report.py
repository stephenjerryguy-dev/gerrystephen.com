"""Daily report generation and delivery.

Builds a markdown report covering portfolio state, trades, signals,
risk warnings, and a recommendation — including an explicit "do nothing"
recommendation when no edge exists. Delivery: email when SMTP is
configured in .env, otherwise terminal + file (always written to disk
regardless).
"""

from __future__ import annotations

import json
import os
import smtplib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

from core.config import Config
from database.models import Position
from reports.trade_journal import TradeJournal


@dataclass
class DailyReportData:
    portfolio_value: float
    cash: float
    open_positions: list[Position]
    position_prices: dict[str, float]
    drawdown_pct: float
    kill_switch_engaged: bool
    kill_switch_reasons: list[str] = field(default_factory=list)
    missed_trades: list[str] = field(default_factory=list)


def build_report(data: DailyReportData, journal: TradeJournal,
                 cfg: Config) -> str:
    now = datetime.now(timezone.utc)
    lines = [
        f"# JerryQuant Daily Report — {now:%Y-%m-%d}",
        "",
        f"Mode: **{cfg.mode.value}**",
        "",
        "## Portfolio",
        f"- Portfolio value: ${data.portfolio_value:,.2f}",
        f"- Cash: ${data.cash:,.2f}",
        f"- Drawdown from peak: {data.drawdown_pct:.2f}%",
        "",
        "## Open positions",
    ]
    if data.open_positions:
        for p in data.open_positions:
            price = data.position_prices.get(p.asset, p.entry_price)
            pnl = p.unrealized_pnl(price)
            lines.append(
                f"- {p.asset}: {p.size:.6f} @ ${p.entry_price:,.2f}, "
                f"now ${price:,.2f}, stop ${p.stop:,.2f}, "
                f"target ${p.target:,.2f}, unrealized P&L ${pnl:+,.2f}"
            )
    else:
        lines.append("- None")

    lines += ["", "## Closed trades today"]
    trades = journal.trades_today()
    day_pnl = 0.0
    if trades:
        for t in trades:
            day_pnl += t["pnl"] or 0.0
            lines.append(
                f"- {t['asset']} {t['direction']}: entry ${t['entry_price']:,.2f} "
                f"→ exit ${t['exit_price']:,.2f}, P&L ${t['pnl']:+,.2f} "
                f"({t['exit_reason']})"
            )
        lines.append(f"- **Day P&L: ${day_pnl:+,.2f}**")
    else:
        lines.append("- None")

    lines += ["", "## New signals today"]
    signals = journal.signals_today()
    entries = [s for s in signals if s["signal_type"] == "ENTRY"]
    avoids = [s for s in signals if s["signal_type"] == "AVOID"]
    if entries:
        for s in entries:
            lines.append(
                f"- ENTRY {s['asset']} @ ${s['entry']:,.2f} "
                f"(confidence {s['confidence']}, {s['strategy']})"
            )
    else:
        lines.append("- No entry signals")
    if avoids:
        lines.append(f"- {len(avoids)} AVOID decision(s) journaled")

    lines += ["", "## Missed trades"]
    if data.missed_trades:
        lines += [f"- {m}" for m in data.missed_trades]
    else:
        lines.append("- None")

    lines += ["", "## Risk warnings"]
    warnings = []
    if data.kill_switch_engaged:
        warnings.append(
            "KILL SWITCH ENGAGED: " + "; ".join(data.kill_switch_reasons or ["see HALT_TRADING.txt"])
        )
    if data.drawdown_pct > cfg.risk.max_total_drawdown_pct * 0.7:
        warnings.append(
            f"Drawdown {data.drawdown_pct:.1f}% is approaching the "
            f"{cfg.risk.max_total_drawdown_pct:.0f}% shutdown limit"
        )
    for e in journal.risk_events_today():
        warnings.append(f"{e['event']}: {e['detail']}")
    lines += [f"- {w}" for w in warnings] if warnings else ["- None"]

    lines += ["", "## Suggested actions"]
    if data.kill_switch_engaged:
        lines.append(
            "- Trading is halted. Review the cause, then delete "
            "HALT_TRADING.txt only when you understand what happened."
        )
    elif entries:
        lines.append("- Review the entry signals above before any approval.")
    else:
        lines.append(
            "- **Do nothing.** No edge exists today; the correct trade is no trade."
        )

    return "\n".join(lines)


def save_report(report: str, cfg: Config, base_dir: Path) -> Path:
    out_dir = base_dir / cfg.reporting.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"report_{datetime.now(timezone.utc):%Y%m%d}.md"
    path.write_text(report)
    return path


def deliver_report(report: str, cfg: Config, base_dir: Path,
                   output_fn=print) -> None:
    """Always saves to file; emails if SMTP is configured, else prints."""
    path = save_report(report, cfg, base_dir)
    if cfg.reporting.email.enabled and _smtp_configured():
        try:
            _send_email(report, cfg)
            output_fn(f"Report emailed and saved to {path}")
            return
        except Exception as e:
            output_fn(f"Email delivery failed ({e}); falling back to terminal.")
    output_fn(report)
    output_fn(f"\nReport saved to {path}")


def _smtp_configured() -> bool:
    return bool(
        os.environ.get("SMTP_HOST")
        and os.environ.get("SMTP_USER")
        and os.environ.get("SMTP_PASSWORD")
    )


def _send_email(report: str, cfg: Config) -> None:
    _send_markdown_email(
        report,
        cfg,
        subject=f"JerryQuant Daily Report — {datetime.now(timezone.utc):%Y-%m-%d}",
    )


def send_markdown_email(report: str, cfg: Config, subject: str,
                        output_fn=print) -> bool:
    if not (cfg.reporting.email.enabled and _smtp_configured()):
        output_fn("Email not configured; proposal printed and saved only.")
        return False
    try:
        _send_markdown_email(report, cfg, subject)
        output_fn("Email sent.")
        return True
    except Exception as e:
        output_fn(f"Email delivery failed ({e}); proposal printed and saved only.")
        return False


def _send_markdown_email(report: str, cfg: Config, subject: str) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    sender = os.environ.get("REPORT_EMAIL_FROM", user)
    recipient = (
        os.environ.get("REPORT_EMAIL_TO") or cfg.reporting.email.recipient
    )
    if not recipient:
        raise ValueError("No report recipient configured")

    msg = MIMEText(report, "plain")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient

    with smtplib.SMTP(host, port, timeout=30) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(sender, [recipient], msg.as_string())
