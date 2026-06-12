"""Robinhood MCP broker interface — DISABLED until explicitly armed.

Three independent locks must ALL be open before this broker will accept
an order, and there is no code path that opens them programmatically:

1. config.yaml: execution.live_trading_enabled must be true
   (ships false; changing it is a deliberate human edit).
2. .env: ROBINHOOD_MCP_URL and ROBINHOOD_MCP_API_KEY must be set.
3. Runtime: mode must be LIVE_APPROVED and every order needs the
   per-trade manual approval collected by the order manager.

Owner decision 2026-06-12: the live test runs with $100 in Robinhood's
dedicated agentic account (endpoint: agent.robinhood.com/mcp/trading).

discover() speaks the standard MCP streamable-HTTP protocol (initialize,
then tools/list) so the first connected run can enumerate Robinhood's
actual tool names and schemas. Order placement is wired up only after
that discovery — we do not guess at an API we have never seen, the same
way we do not trade on data we do not trust.
"""

from __future__ import annotations

import json
import os
from typing import Optional

from core.config import Config, Mode
from database.models import Signal
from risk.kill_switch import KillSwitch


class BrokerDisabled(Exception):
    """The live broker is not armed. This is the expected state."""


class RobinhoodMCPBroker:
    def __init__(self, cfg: Config, kill_switch: KillSwitch):
        self.cfg = cfg
        self.kill_switch = kill_switch
        self.url = os.environ.get("ROBINHOOD_MCP_URL", "").strip()
        self.api_key = os.environ.get("ROBINHOOD_MCP_API_KEY", "").strip()

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

    def get_balance(self) -> Optional[float]:
        """Returns None when the balance cannot be verified — callers must
        treat that as a kill-switch condition, never assume a value."""
        if not self.is_armed():
            return None
        # Wired up after discover() reveals Robinhood's balance tool.
        return None

    def discover(self) -> list[dict]:
        """MCP handshake + tools/list against the configured endpoint.

        Read-only: lists the tools Robinhood exposes (names, descriptions,
        input schemas) so order placement can be implemented against the
        real API instead of guesses. Requires only the URL; sends the API
        key as a bearer token when present.
        """
        if not self.url:
            raise BrokerDisabled("ROBINHOOD_MCP_URL is not set in .env.")
        import httpx

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        def parse(resp: httpx.Response) -> dict:
            if "text/event-stream" in resp.headers.get("content-type", ""):
                for line in resp.text.splitlines():
                    if line.startswith("data:"):
                        return json.loads(line[len("data:"):].strip())
                raise ValueError("Empty SSE response from MCP server")
            return resp.json()

        with httpx.Client(timeout=30) as client:
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
            parse(init)
            client.post(self.url, headers=headers, json={
                "jsonrpc": "2.0", "method": "notifications/initialized",
            })
            listing = client.post(self.url, headers=headers, json={
                "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {},
            })
            listing.raise_for_status()
            return parse(listing).get("result", {}).get("tools", [])

    def place_order(self, signal: Signal, size_units: float,
                    manually_approved: bool) -> None:
        self.kill_switch.assert_can_trade()
        self.assert_armed()
        if not manually_approved:
            raise BrokerDisabled(
                "Order rejected: explicit manual approval was not given."
            )
        raise NotImplementedError(
            "Robinhood MCP order placement is not wired up yet. Run "
            "LIVE_APPROVED mode once connected to enumerate Robinhood's "
            "tools via discover(); placement is then implemented against "
            "those real tool schemas."
        )
