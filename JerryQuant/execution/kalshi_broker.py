"""Kalshi order path — DISARMED until credentialed discovery.

This mirrors how the Robinhood broker was built: read-only market data first
(see data_sources/kalshi.py, whose field names came from live responses), and
order placement implemented ONLY after we can authenticate and see the real
order schema. Kalshi's trading endpoints require an API key ID plus an RSA
private key that signs each request; without those we cannot verify the
request shape, and JerryQuant does not guess at an API it has not seen.

So `place_order` intentionally raises. What's here is the arming logic, the
risk gates, and the shape of the flow — so wiring it up later is a small,
verifiable step rather than a leap of faith.

Three locks, same as the equity broker:
  1. config: strategy/prediction_market must be enabled,
  2. credentials: KALSHI_API_KEY_ID + KALSHI_PRIVATE_KEY present,
  3. runtime: explicit human approval per order.
"""

from __future__ import annotations

import os
from typing import Optional

from core.config import Config
from risk.kill_switch import KillSwitch

BASE_URL = "https://api.elections.kalshi.com"

# VERIFIED by authenticated discovery (not from memory):
#  * POST /trade-api/v2/portfolio/orders returns 410 deprecated_v1_order_endpoint.
#    The live create-order path is the one below.
#  * An empty body there returns 400 listing the required fields:
#    Ticker, TimeInForce, SelfTradePreventionType.
#  * time_in_force enum includes: fill_or_kill | immediate_or_cancel |
#    good_till_cancel. The self_trade_prevention_type enum values are NOT yet
#    confirmed, which is why placement stays unimplemented.
ORDER_PATH = "/trade-api/v2/portfolio/events/orders"
BALANCE_PATH = "/trade-api/v2/portfolio/balance"
POSITIONS_PATH = "/trade-api/v2/portfolio/positions"


class KalshiDisabled(Exception):
    """The Kalshi venue is not armed. This is the expected state."""


class KalshiOrderError(Exception):
    """A Kalshi order was rejected or could not be built."""


class KalshiBroker:
    def __init__(self, cfg: Config, kill_switch: KillSwitch):
        self.cfg = cfg
        self.kill_switch = kill_switch
        self.api_key_id = os.environ.get("KALSHI_API_KEY_ID", "").strip()
        # Kalshi issues a multi-line RSA PEM. Prefer pointing at the .pem file
        # (KALSHI_PRIVATE_KEY_PATH) so the key never has to be mangled into a
        # one-line .env value — and so it stays a gitignored file on disk.
        self.private_key = os.environ.get("KALSHI_PRIVATE_KEY", "").strip()
        key_path = os.environ.get("KALSHI_PRIVATE_KEY_PATH", "").strip()
        if not self.private_key and key_path:
            try:
                with open(os.path.expanduser(key_path)) as f:
                    self.private_key = f.read().strip()
            except OSError:
                self.private_key = ""   # missing/unreadable key = simply not armed

    # --- arming ---

    @property
    def _venue_enabled(self) -> bool:
        pm = getattr(self.cfg.strategy, "prediction_market", None)
        return bool(getattr(pm, "enabled", False))

    def credentials_present(self) -> bool:
        return bool(self.api_key_id and self.private_key)

    def is_armed(self) -> bool:
        return self._venue_enabled and self.credentials_present()

    def status(self) -> dict:
        return {
            "venue_enabled": self._venue_enabled,
            "credentials_present": self.credentials_present(),
            "armed": self.is_armed(),
            "order_placement": "NOT IMPLEMENTED (awaiting credentialed discovery)",
        }

    def assert_armed(self) -> None:
        if not self._venue_enabled:
            raise KalshiDisabled(
                "Prediction-market venue is disabled in config "
                "(strategy.prediction_market.enabled: false)."
            )
        if not self.credentials_present():
            raise KalshiDisabled(
                "Kalshi credentials missing: set KALSHI_API_KEY_ID and "
                "KALSHI_PRIVATE_KEY in .env."
            )

    # --- authenticated transport (signing scheme verified against live API) ---

    def _signed_headers(self, method: str, path: str) -> dict:
        """Kalshi signs `timestamp + METHOD + path` with RSA-PSS/SHA-256."""
        import base64
        import time
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        if not self.credentials_present():
            raise KalshiDisabled("Kalshi credentials are not configured.")
        key = serialization.load_pem_private_key(
            self.private_key.encode(), password=None
        )
        ts = str(int(time.time() * 1000))
        sig = key.sign(
            (ts + method + path).encode(),
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()),
                        salt_length=hashes.SHA256.digest_size),
            hashes.SHA256(),
        )
        return {
            "KALSHI-ACCESS-KEY": self.api_key_id,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode(),
            "KALSHI-ACCESS-TIMESTAMP": ts,
            "Accept": "application/json",
        }

    def _get(self, path: str) -> dict:
        import httpx
        r = httpx.get(BASE_URL + path,
                      headers=self._signed_headers("GET", path), timeout=25)
        r.raise_for_status()
        return r.json()

    # --- read side ---

    def get_balance(self) -> Optional[float]:
        """Account balance in DOLLARS.

        Critical unit trap found in discovery: the `balance` field is in CENTS
        (2500 == $25) while `balance_dollars` is the dollar figure. Using the
        raw field would size every position 100x too large, so we read
        `balance_dollars` and never the bare `balance`."""
        try:
            data = self._get(BALANCE_PATH)
            return float(data["balance_dollars"])
        except Exception:
            return None      # unverifiable balance must never become a trade

    def get_positions(self) -> list:
        data = self._get(POSITIONS_PATH)
        return data.get("market_positions", []) or []

    def market(self, ticker: str):
        from data_sources import kalshi
        return kalshi.fetch_market(ticker)

    # --- order side (deliberately not implemented) ---

    def place_order(self, ticker: str, side: str, units: float,
                    limit_price: float, manually_approved: bool) -> dict:
        """Would buy `units` of `ticker` at `limit_price` (0-1 dollars).

        Every gate is checked first so the failure is honest about WHY, and so
        wiring the real request later can't skip a gate."""
        self.kill_switch.assert_can_trade()
        self.assert_armed()
        if not manually_approved:
            raise KalshiDisabled(
                "Order rejected: explicit manual approval was not given."
            )
        if side not in ("yes", "no"):
            raise KalshiOrderError(f"side must be 'yes' or 'no', got {side}")
        if units <= 0:
            raise KalshiOrderError(f"Invalid size {units}")
        if not 0 < limit_price < 1:
            raise KalshiOrderError(
                f"limit_price must be between 0 and 1 (dollars), got {limit_price}"
            )
        raise NotImplementedError(
            "Kalshi order placement is not wired up. It will be implemented "
            "against the real order schema once KALSHI_API_KEY_ID / "
            "KALSHI_PRIVATE_KEY are present and an authenticated discovery "
            "call confirms the request shape — the same way the Robinhood "
            "broker was built. JerryQuant does not guess at an API."
        )
