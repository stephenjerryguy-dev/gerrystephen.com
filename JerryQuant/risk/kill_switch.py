"""Kill switch.

The single choke point that can halt all trading. Once engaged it writes
the halt file (HALT_TRADING.txt by default) so the halt survives restarts;
a human must delete the file to re-enable trading. The presence of the
halt file alone — however it got there — blocks all trades.

Engage triggers (per the JerryQuant safety spec):
- daily / monthly / total drawdown limit hit
- API error
- stale data feed
- account balance cannot be verified
- position size calculation failure
- unexpected open position
- manual shutdown (the user creates the halt file by hand)
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional


class TradingHalted(Exception):
    """Raised when an action is attempted while the kill switch is engaged."""


class KillSwitch:
    def __init__(
        self,
        halt_file: str | Path = "HALT_TRADING.txt",
        on_engage: Optional[Callable[[str], None]] = None,
    ):
        self.halt_file = Path(halt_file)
        self.reasons: list[str] = []
        self._on_engage = on_engage

    @property
    def engaged(self) -> bool:
        return self.halt_file.exists() or bool(self.reasons)

    def engage(self, reason: str) -> None:
        """Halt all trading and persist the halt to disk."""
        timestamp = datetime.now(timezone.utc).isoformat()
        self.reasons.append(reason)
        line = f"[{timestamp}] TRADING HALTED: {reason}\n"
        with open(self.halt_file, "a") as f:
            f.write(line)
        if self._on_engage:
            self._on_engage(reason)

    def assert_can_trade(self) -> None:
        """Raise TradingHalted if any halt condition is active."""
        if self.halt_file.exists():
            raise TradingHalted(
                f"Halt file {self.halt_file} exists. Delete it manually to "
                f"resume trading after reviewing why it was created."
            )
        if self.reasons:
            raise TradingHalted(f"Kill switch engaged: {'; '.join(self.reasons)}")

    def can_trade(self) -> bool:
        try:
            self.assert_can_trade()
            return True
        except TradingHalted:
            return False

    def check_data_freshness(
        self, last_bar_time: datetime, max_age_hours: float, asset: str
    ) -> None:
        """Engage if the data feed is stale."""
        now = datetime.now(timezone.utc)
        if last_bar_time.tzinfo is None:
            last_bar_time = last_bar_time.replace(tzinfo=timezone.utc)
        age_hours = (now - last_bar_time).total_seconds() / 3600.0
        if age_hours > max_age_hours:
            self.engage(
                f"Stale data for {asset}: last bar is {age_hours:.1f}h old "
                f"(limit {max_age_hours}h)"
            )

    def check_balance(self, balance: Optional[float]) -> None:
        """Engage if the account balance cannot be verified."""
        if balance is None or balance < 0:
            self.engage(f"Account balance cannot be verified (got {balance!r})")
