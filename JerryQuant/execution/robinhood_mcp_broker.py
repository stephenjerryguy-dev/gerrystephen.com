"""Robinhood MCP broker interface.

Three independent locks must ALL be open before this broker will accept
an order, and there is no code path that opens them programmatically:

1. config.yaml: execution.live_trading_enabled must be true
   (ships false; changing it is a deliberate human edit).
2. .env: ROBINHOOD_MCP_URL and ROBINHOOD_MCP_API_KEY must be set.
3. Runtime: mode must be LIVE_APPROVED and every order needs the
   per-trade manual approval collected by the order manager.

Owner decision 2026-06-12: the live test runs with $100 in Robinhood's
dedicated agentic account (endpoint: agent.robinhood.com/mcp/trading).

Order placement is implemented against the tool schemas enumerated by
discover() on 2026-06-12 (33 tools; full schemas journaled in
logs/robinhood_mcp_tools.json). Equities only: Robinhood's agentic MCP
exposes no crypto order tools, so crypto signals can never trade live
through this broker. Every order is review_equity_order first, then
place_equity_order with an idempotency ref_id — and only after the
caller has collected explicit per-trade human approval.

Stops are software-managed: fractional positions (unavoidable at $100
account size) cannot carry native stop orders, so the daily cycle
checks stops/targets/trend-breaks and exits with a market order. This
matches paper-mode behavior on daily bars.
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, Optional

from core.config import Config, Mode
from database.models import Signal
from risk.kill_switch import KillSwitch


class BrokerDisabled(Exception):
    """The live broker is not armed. This is the expected state."""


class OrderError(Exception):
    """Robinhood rejected or blocked an order. The message says why."""


class RobinhoodMCPBroker:
    def __init__(self, cfg: Config, kill_switch: KillSwitch):
        self.cfg = cfg
        self.kill_switch = kill_switch
        self.url = os.environ.get("ROBINHOOD_MCP_URL", "").strip()
        self.api_key = os.environ.get("ROBINHOOD_MCP_API_KEY", "").strip()
        self._account_number: Optional[str] = None

    def status(self) -> dict:
        return {
            "config_live_trading_enabled": self.cfg.execution.live_trading_enabled,
            "credentials_present": bool(self.url and self.api_key),
            "mode": self.cfg.mode.value,
            "armed": self.is_armed(),
        }

    def is_armed(self) -> bool:
        return (
            self.cfg.execution.live_trading_enabled
            and bool(self.url and self.api_key)
            and self.cfg.mode == Mode.LIVE_APPROVED
        )

    def assert_armed(self) -> None:
        if not self.cfg.execution.live_trading_enabled:
            raise BrokerDisabled(
                "Live trading is disabled in config.yaml "
                "(execution.live_trading_enabled: false)."
            )
        if not (self.url and self.api_key):
            raise BrokerDisabled(
                "Robinhood MCP credentials are not configured in .env."
            )
        if self.cfg.mode != Mode.LIVE_APPROVED:
            raise BrokerDisabled(
                f"Mode is {self.cfg.mode.value}; live orders require LIVE_APPROVED."
            )

    # ------------------------------------------------------------------
    # MCP transport
    # ------------------------------------------------------------------

    def _headers(self) -> dict:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    @staticmethod
    def _parse(resp) -> dict:
        if "text/event-stream" in resp.headers.get("content-type", ""):
            for line in resp.text.splitlines():
                if line.startswith("data:"):
                    return json.loads(line[len("data:"):].strip())
            raise ValueError("Empty SSE response from MCP server")
        return resp.json()

    def _session(self):
        """Open an initialized MCP session. Returns (client, headers)."""
        if not self.url:
            raise BrokerDisabled("ROBINHOOD_MCP_URL is not set in .env.")
        import httpx

        headers = self._headers()
        client = httpx.Client(timeout=30)
        init = client.post(self.url, headers=headers, json={
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "jerryquant", "version": "0.1.0"},
            },
        })
        init.raise_for_status()
        session_id = init.headers.get("mcp-session-id")
        if session_id:
            headers["Mcp-Session-Id"] = session_id
        self._parse(init)
        client.post(self.url, headers=headers, json={
            "jsonrpc": "2.0", "method": "notifications/initialized",
        })
        return client, headers

    def call_tool(self, name: str, arguments: dict) -> Any:
        """tools/call against the live endpoint. Returns the tool's data
        payload. Raises OrderError on tool-level errors — callers must
        never treat a failed call as success."""
        client, headers = self._session()
        try:
            resp = client.post(self.url, headers=headers, json={
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            })
            resp.raise_for_status()
            body = self._parse(resp)
        finally:
            client.close()
        if "error" in body:
            raise OrderError(f"{name}: MCP error {body['error']}")
        result = body.get("result", {})
        if result.get("isError"):
            texts = [c.get("text", "") for c in result.get("content", [])]
            raise OrderError(f"{name}: {' '.join(texts)[:500]}")
        if "structuredContent" in result:
            return result["structuredContent"].get("data",
                                                   result["structuredContent"])
        for c in result.get("content", []):
            if c.get("type") == "text":
                try:
                    parsed = json.loads(c["text"])
                    return parsed.get("data", parsed)
                except (json.JSONDecodeError, AttributeError):
                    return c["text"]
        return result

    def discover(self) -> list[dict]:
        """MCP handshake + tools/list against the configured endpoint.

        Read-only: lists the tools Robinhood exposes (names, descriptions,
        input schemas). Requires only the URL; sends the API key as a
        bearer token when present.
        """
        client, headers = self._session()
        try:
            listing = client.post(self.url, headers=headers, json={
                "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {},
            })
            listing.raise_for_status()
            return self._parse(listing).get("result", {}).get("tools", [])
        finally:
            client.close()

    # ------------------------------------------------------------------
    # Account / read-side
    # ------------------------------------------------------------------

    def get_account_number(self) -> str:
        """Resolve the agentic-enabled account. Refuses to guess: exactly
        one active agentic_allowed account must exist (Robinhood keeps the
        agentic account separate from the rest of the portfolio)."""
        if self._account_number:
            return self._account_number
        env_acct = os.environ.get("ROBINHOOD_ACCOUNT_NUMBER", "").strip()
        if env_acct:
            self._account_number = env_acct
            return env_acct
        data = self.call_tool("get_accounts", {})
        accounts = data.get("accounts") or []
        agentic = [
            a for a in accounts
            if a.get("agentic_allowed")
            and a.get("state", "active") == "active"
            and not a.get("deactivated")
        ]
        if len(agentic) != 1:
            raise OrderError(
                f"Expected exactly 1 active agentic account, found "
                f"{len(agentic)}. Set ROBINHOOD_ACCOUNT_NUMBER in .env to "
                f"choose explicitly."
            )
        self._account_number = agentic[0]["account_number"]
        return self._account_number

    def get_balance(self) -> Optional[float]:
        """Total value of the agentic account. Returns None when the
        balance cannot be verified — callers must treat that as a
        kill-switch condition, never assume a value."""
        if not self.is_armed():
            return None
        try:
            data = self.call_tool(
                "get_portfolio", {"account_number": self.get_account_number()}
            )
            return float(data["total_value"])
        except (OrderError, KeyError, ValueError, TypeError):
            return None

    def get_buying_power(self) -> Optional[float]:
        if not self.is_armed():
            return None
        try:
            data = self.call_tool(
                "get_portfolio", {"account_number": self.get_account_number()}
            )
            return float(data["buying_power"]["buying_power"])
        except (OrderError, KeyError, ValueError, TypeError):
            return None

    def get_live_positions(self) -> dict[str, float]:
        """Open equity positions as {symbol: sellable_shares}."""
        data = self.call_tool(
            "get_equity_positions",
            {"account_number": self.get_account_number()},
        )
        out: dict[str, float] = {}
        for p in data.get("positions") or []:
            qty = float(p.get("shares_available_for_sells")
                        or p.get("quantity") or 0)
            if qty > 0 and p.get("type") == "long":
                out[p["symbol"]] = qty
        return out

    # ------------------------------------------------------------------
    # Orders
    # ------------------------------------------------------------------

    def _tradable_symbol(self, asset: str) -> str:
        """Live trading is equities-only: Robinhood's agentic MCP exposes
        no crypto order tools. Crypto stays paper/backtest by design."""
        equities = {a.upper() for a in self.cfg.watchlist.equities}
        symbol = asset.upper().replace("-USD", "")
        if symbol not in equities:
            raise OrderError(
                f"{asset} is not live-tradable: Robinhood's agentic MCP "
                f"only exposes equity order tools, and {symbol} is not in "
                f"the equities watchlist."
            )
        return symbol

    def _order_params(self, symbol: str, side: str, quantity: float) -> dict:
        # Fractional quantities require type=market + regular_hours per
        # Robinhood's schema — and a $100 account trades fractions of SPY.
        return {
            "account_number": self.get_account_number(),
            "symbol": symbol,
            "side": side,
            "type": "market",
            "quantity": f"{quantity:.6f}".rstrip("0").rstrip("."),
            "time_in_force": "gfd",
            "market_hours": "regular_hours",
        }

    def review_order(self, symbol: str, side: str, quantity: float) -> dict:
        """Robinhood's native pre-trade simulation: current quote plus
        buying-power / halt / PDT alerts. Read-only."""
        return self.call_tool(
            "review_equity_order", self._order_params(symbol, side, quantity)
        )

    @staticmethod
    def _blocking_alerts(review: dict) -> list[str]:
        alerts = []
        for a in review.get("alerts") or []:
            if isinstance(a, dict):
                if a.get("severity", "blocking") in ("blocking", "error"):
                    alerts.append(a.get("message") or json.dumps(a)[:200])
            else:
                alerts.append(str(a)[:200])
        return alerts

    def place_order(self, signal: Signal, size_units: float,
                    manually_approved: bool) -> dict:
        """review_equity_order, then place_equity_order. Every gate is
        re-checked here; approval must have been collected by the caller
        (order_manager prompts for the literal word APPROVE)."""
        self.kill_switch.assert_can_trade()
        self.assert_armed()
        if not manually_approved:
            raise BrokerDisabled(
                "Order rejected: explicit manual approval was not given."
            )
        symbol = self._tradable_symbol(signal.asset)
        if size_units <= 0:
            raise OrderError(f"Invalid order size {size_units}")

        review = self.review_order(symbol, "buy", size_units)
        blocking = self._blocking_alerts(review)
        if blocking:
            raise OrderError(
                f"Pre-trade review blocked {symbol}: {'; '.join(blocking)}"
            )

        params = self._order_params(symbol, "buy", size_units)
        params["ref_id"] = str(uuid.uuid4())
        return self.call_tool("place_equity_order", params)

    def sell_position(self, symbol: str, quantity: float,
                      manually_approved: bool) -> dict:
        """Market sell to exit a position (stop / target / trend break).
        Same gates as buys: armed broker + explicit approval. Exits are
        deliberately NOT blocked by the kill switch — a halted system
        must still be able to get out of risk with human approval."""
        self.assert_armed()
        if not manually_approved:
            raise BrokerDisabled(
                "Order rejected: explicit manual approval was not given."
            )
        symbol = self._tradable_symbol(symbol)
        if quantity <= 0:
            raise OrderError(f"Invalid sell quantity {quantity}")
        review = self.review_order(symbol, "sell", quantity)
        blocking = self._blocking_alerts(review)
        if blocking:
            raise OrderError(
                f"Pre-trade review blocked {symbol} sell: {'; '.join(blocking)}"
            )
        params = self._order_params(symbol, "sell", quantity)
        params["ref_id"] = str(uuid.uuid4())
        return self.call_tool("place_equity_order", params)
