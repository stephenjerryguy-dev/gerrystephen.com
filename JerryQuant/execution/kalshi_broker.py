"""Kalshi order path — wired against a VERIFIED schema.

Built the same way as the Robinhood broker: read-only data first, then an
authenticated discovery pass, and only then order placement. Nothing here was
written from memory — the discovery caught three things that would each have
been a live bug:

  * `/portfolio/balance` returns `balance` in CENTS (2500) next to
    `balance_dollars` ("25.0000"). Reading the bare field sizes 100x too big.
  * `POST /trade-api/v2/portfolio/orders` is DEPRECATED (410). The live path
    is /trade-api/v2/portfolio/events/orders.
  * `side` is "bid"/"ask" (not yes/no), `count`/`price` are STRINGS, and
    `self_trade_prevention_type` is "taker_at_cross".

Three locks before anything is sent:
  1. config: strategy.prediction_market.enabled must be true,
  2. credentials: KALSHI_API_KEY_ID + the RSA key (path or inline),
  3. runtime: explicit human approval per order — plus a hard stake cap
     checked against a balance we could actually verify.

Note: only Kalshi is supported. Polymarket is largely restricted for US
persons and is deliberately not implemented.
"""

from __future__ import annotations

import os
from typing import Optional

from core.config import Config
from risk.kill_switch import KillSwitch

BASE_URL = "https://external-api.kalshi.com"   # Kalshi's documented host (api.elections.* also authenticates)

# VERIFIED by authenticated discovery (not from memory):
#  * POST /trade-api/v2/portfolio/orders returns 410 deprecated_v1_order_endpoint.
#    The live create-order path is the one below.
#  * An empty body there returns 400 listing the required fields:
#    Ticker, TimeInForce, SelfTradePreventionType.
#  * time_in_force: fill_or_kill | immediate_or_cancel | good_till_canceled
#    (note the "-ed"), and self_trade_prevention_type: "taker_at_cross".
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
            "order_placement": "implemented against verified create-order-v2 schema",
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

    # --- order side (verified schema; still approval-gated) ---

    def place_order(self, ticker: str, side: str, count: float,
                    price: float, manually_approved: bool,
                    time_in_force: str = "immediate_or_cancel") -> dict:
        """Place a Kalshi order against the VERIFIED create-order-v2 schema.

        `side` is Kalshi's own vocabulary — "bid" (buy) / "ask" (sell) — NOT
        yes/no. `price` is dollars 0-1 (i.e. the implied probability), and the
        API wants count/price as strings. A fresh client_order_id gives
        idempotency, the same role ref_id plays for equities.

        Defaults to immediate_or_cancel so an approved order either fills now
        or dies — an approval means "this trade, now", not a resting order
        that lingers unattended.

        Gates, in order: kill switch -> armed -> explicit human approval ->
        input validation -> hard stake cap against a VERIFIED balance.
        """
        import uuid
        import httpx

        self.kill_switch.assert_can_trade()
        self.assert_armed()
        if not manually_approved:
            raise KalshiDisabled(
                "Order rejected: explicit manual approval was not given."
            )
        if side not in ("bid", "ask"):
            raise KalshiOrderError(f"side must be 'bid' or 'ask', got {side!r}")
        if count <= 0:
            raise KalshiOrderError(f"Invalid count {count}")
        if not 0 < price < 1:
            raise KalshiOrderError(
                f"price must be between 0 and 1 dollars, got {price}"
            )
        if time_in_force not in ("immediate_or_cancel", "fill_or_kill",
                                 "good_till_canceled"):
            raise KalshiOrderError(f"bad time_in_force {time_in_force!r}")

        # Hard stake cap, checked against a balance we can actually verify.
        balance = self.get_balance()
        if balance is None or balance <= 0:
            raise KalshiOrderError(
                "Kalshi balance could not be verified — refusing to size a trade."
            )
        pm = self.cfg.strategy.prediction_market
        from core.config import HARD_MAX_BINARY_STAKE_PCT
        cap_pct = min(pm.max_stake_pct, HARD_MAX_BINARY_STAKE_PCT)
        stake = count * price
        if stake > balance * cap_pct / 100.0:
            raise KalshiOrderError(
                f"stake ${stake:,.2f} exceeds the {cap_pct:.1f}% cap "
                f"(${balance * cap_pct / 100.0:,.2f} of ${balance:,.2f})"
            )

        body = {
            "ticker": ticker,
            "client_order_id": str(uuid.uuid4()),
            "side": side,
            "count": f"{count:.2f}",
            "price": f"{price:.4f}",
            "time_in_force": time_in_force,
            "self_trade_prevention_type": "taker_at_cross",
            "post_only": False,
            "cancel_order_on_pause": False,
            "reduce_only": False,
            "subaccount": 0,
            "exchange_index": 0,
        }
        headers = {**self._signed_headers("POST", ORDER_PATH),
                   "Content-Type": "application/json"}
        r = httpx.post(BASE_URL + ORDER_PATH, headers=headers, json=body, timeout=25)
        if r.status_code >= 400:
            raise KalshiOrderError(f"Kalshi rejected order ({r.status_code}): "
                                   f"{r.text[:300]}")
        return r.json()
