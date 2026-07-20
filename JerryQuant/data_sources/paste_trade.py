"""Read-only adapter for paste.trade's public "best trades" page.

This module intentionally does not create broker orders. Public social trades
are unverified third-party observations, frequently use leverage, and may name
instruments that are unavailable at a connected broker. The adapter's only
job is to normalize the visible feed for monitoring and later human review.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Iterable

import httpx

PASTE_TRADE_URL = "https://paste.trade/"
PASTE_TRADE_BOARD_URL = "https://paste.trade/api/board?window=today&lens=max"
_SOURCE_RE = re.compile(
    r"^https://app\.paste\.trade/s/[^?#]+(?:\?[^#]*)?#(?P<trade_id>t-[\w-]+)$"
)
_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.]{0,14}$")
_DIRECTION_RE = re.compile(r"\b(LONG|SHORT)\b")
_LEVERAGE_RE = re.compile(r"\b(\d{1,3})x\b", re.IGNORECASE)
_HANDLE_RE = re.compile(r"@[A-Za-z0-9_]{2,32}")


class _Node:
    def __init__(self, tag: str, attrs: dict[str, str], parent: "_Node | None"):
        self.tag = tag
        self.attrs = attrs
        self.parent = parent
        self.children: list[_Node | str] = []

    def text(self) -> str:
        chunks: list[str] = []

        def walk(node: _Node) -> None:
            for child in node.children:
                if isinstance(child, str):
                    chunks.append(child)
                else:
                    walk(child)

        walk(self)
        return " ".join(" ".join(chunks).split())


class _TreeParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Node("root", {}, None)
        self.current = self.root

    def handle_starttag(self, tag, attrs):
        node = _Node(tag, dict(attrs), self.current)
        self.current.children.append(node)
        if tag not in {"br", "img", "input", "link", "meta", "source", "hr"}:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.current.tag == tag:
            self.current = self.current.parent or self.root

    def handle_endtag(self, tag):
        node = self.current
        while node is not self.root:
            if node.tag == tag:
                self.current = node.parent or self.root
                return
            node = node.parent or self.root

    def handle_data(self, data):
        if data.strip():
            self.current.children.append(data)


@dataclass(frozen=True)
class PasteTrade:
    trade_id: str
    symbol: str
    direction: str
    leverage: int | None
    source_handle: str | None
    source_url: str


def _nodes(root: _Node) -> Iterable[_Node]:
    for child in root.children:
        if isinstance(child, _Node):
            yield child
            yield from _nodes(child)


def parse_best_trades(html: str) -> list[PasteTrade]:
    parser = _TreeParser()
    parser.feed(html)
    trades: list[PasteTrade] = []
    seen: set[str] = set()

    for node in _nodes(parser.root):
        if node.tag != "a":
            continue
        href = node.attrs.get("href", "")
        match = _SOURCE_RE.match(href)
        symbol = node.text().strip().upper()
        if not match or not _SYMBOL_RE.match(symbol):
            continue

        context = node.parent
        context_text = ""
        while context is not None and context is not parser.root:
            candidate = context.text()
            if _DIRECTION_RE.search(candidate):
                context_text = candidate
                break
            context = context.parent
        direction_match = _DIRECTION_RE.search(context_text)
        if not direction_match:
            continue

        trade_id = match.group("trade_id")
        if trade_id in seen:
            continue
        seen.add(trade_id)
        leverage_match = _LEVERAGE_RE.search(context_text)
        handle_match = _HANDLE_RE.search(context_text)
        trades.append(PasteTrade(
            trade_id=trade_id,
            symbol=symbol,
            direction=direction_match.group(1),
            leverage=int(leverage_match.group(1)) if leverage_match else None,
            source_handle=handle_match.group(0) if handle_match else None,
            source_url=href,
        ))
    return trades


def parse_board_payload(payload: dict) -> list[PasteTrade]:
    """Normalize the same public board payload used by paste.trade's page."""
    trades: list[PasteTrade] = []
    seen: set[str] = set()
    for row in payload.get("rows", []):
        raw_id = str(row.get("id", "")).strip()
        source_id = str(row.get("source_id", "")).strip()
        symbol = str(row.get("display_ticker") or row.get("ticker") or "").upper()
        direction = str(row.get("direction", "")).upper()
        if not raw_id or not source_id or not _SYMBOL_RE.match(symbol):
            continue
        if direction not in {"LONG", "SHORT"}:
            continue
        trade_id = raw_id if raw_id.startswith("t-") else f"t-{raw_id}"
        if trade_id in seen:
            continue
        seen.add(trade_id)
        leverage = row.get("leverage")
        try:
            leverage = int(leverage) if leverage is not None else None
        except (TypeError, ValueError):
            leverage = None
        handle = str(row.get("author_handle", "")).strip().lstrip("@")
        trades.append(PasteTrade(
            trade_id=trade_id,
            symbol=symbol,
            direction=direction,
            leverage=leverage,
            source_handle=f"@{handle}" if handle else None,
            source_url=(
                f"https://app.paste.trade/s/{source_id}#{trade_id}"
            ),
        ))
    return trades


def fetch_best_trades(url: str = PASTE_TRADE_BOARD_URL) -> list[PasteTrade]:
    response = httpx.get(
        url,
        headers={"User-Agent": "JerryQuant/0.2 (+https://gerrystephen.com/agents/jerryquant)"},
        follow_redirects=True,
        timeout=20,
    )
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if "json" in content_type:
        return parse_board_payload(response.json())
    # Fallback for a future server-rendered board.
    return parse_best_trades(response.text)


def render_report(trades: list[PasteTrade]) -> str:
    lines = [
        "# JerryQuant — paste.trade monitor",
        "",
        "Read-only public-feed observations. No broker or wallet orders were placed.",
        "",
    ]
    if not trades:
        return "\n".join(lines + ["No parseable trades are currently visible."])
    for trade in trades:
        leverage = f" · {trade.leverage}x shown" if trade.leverage else ""
        source = f" · {trade.source_handle}" if trade.source_handle else ""
        lines.append(
            f"- **{trade.symbol} {trade.direction}**{leverage}{source} "
            f"— [source]({trade.source_url})"
        )
    lines += [
        "",
        f"Observed {len(trades)} public trade(s). These are inputs for review, "
        "not recommendations or executable tickets.",
    ]
    return "\n".join(lines)
