"""Robinhood MCP broker interface — DISABLED until explicitly armed.

Three independent locks must ALL be open before this broker will accept
an order, and there is no code path that opens them programmatically:

1. config.yaml: execution.live_trading_enabled must be true
   (ships false; changing it is a deliberate human edit).
2. .env: ROBINHOOD_MCP_URL and ROBINHOOD_MCP_API_KEY must be set.
3. Runtime: mode must be LIVE_APPROVED and every order needs the
   per-trade manual approval collected by the order manager.

The actual MCP wire calls are intentionally not implemented yet — they
will be added only after backtesting and paper trading are validated and
connection details are provided. Until then place_order raises.
"""

from __future__ import annotations

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
        # MCP balance call not implemented yet.
        return None

    def place_order(self, signal: Signal, size_units: float,
                    manually_approved: bool) -> None:
        self.kill_switch.assert_can_trade()
        self.assert_armed()
        if not manually_approved:
            raise BrokerDisabled(
                "Order rejected: explicit manual approval was not given."
            )
        raise NotImplementedError(
            "Robinhood MCP order placement is not implemented yet. It will be "
            "built only after backtesting and paper trading are validated and "
            "connection details are provided."
        )
