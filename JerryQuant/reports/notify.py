"""Push notifications for trade tickets that need approval.

When the agent proposes actions, push the ticket straight to your phone via
ntfy (free, no account) with a tap-through link to the GitHub approval. You
see exactly what's proposed in the notification, then approve with a tap —
the secure approval still happens at the GitHub Environment gate; this just
makes it fast and gives you the details up front.

Set JERRYQUANT_NTFY_TOPIC to a long, random topic name (treat it like a
password — anyone who knows the topic can read these). Install the ntfy app,
subscribe to that topic. If unset, this is a silent no-op.
"""

from __future__ import annotations

import os
from typing import Optional


def _run_url() -> Optional[str]:
    """Link to the current GitHub Actions run (where you approve), when the
    code is running inside Actions; otherwise the repo's Actions tab."""
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    repo = os.environ.get("GITHUB_REPOSITORY")
    run_id = os.environ.get("GITHUB_RUN_ID")
    if repo and run_id:
        return f"{server}/{repo}/actions/runs/{run_id}"
    if repo:
        return f"{server}/{repo}/actions"
    return None


def push_ticket(title: str, message: str, click_url: Optional[str] = None) -> bool:
    """Send a push to the configured ntfy topic. Returns True if sent.
    Best-effort: never raises (a failed notification must not break a run)."""
    topic = os.environ.get("JERRYQUANT_NTFY_TOPIC", "").strip()
    if not topic:
        return False
    import httpx

    headers = {"Title": title, "Tags": "money_with_wings", "Priority": "high"}
    url = click_url or _run_url()
    if url:
        headers["Click"] = url
        headers["Actions"] = f"view, Approve in GitHub, {url}"
    try:
        httpx.post(f"https://ntfy.sh/{topic}",
                   data=message.encode("utf-8"), headers=headers, timeout=15)
        return True
    except Exception:
        return False


def summarize_actions(actions: list[dict]) -> str:
    """One-line-per-action summary for the push body."""
    lines = []
    for a in actions:
        kind = a.get("kind")
        sym = a.get("symbol")
        if kind == "entry":
            px = a.get("entry") or a.get("reference_price") or 0.0
            lines.append(f"BUY {sym} ~{a.get('units', 0):.4f} @ ${px:,.2f}")
        elif kind == "exit":
            lines.append(f"SELL {sym} ~{a.get('units', 0):.4f}")
        elif kind == "scale_out":
            lines.append(f"SCALE-OUT {sym} ~{a.get('units', 0):.4f}")
    return "\n".join(lines) or "review proposed actions"
