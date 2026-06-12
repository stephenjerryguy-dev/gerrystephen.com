"""Prediction-market data (Polymarket / Kalshi style) — research only.

This module is intentionally inert at launch: unless POLYMARKET_API_URL is
set in the environment, fetch_probabilities returns an empty list and the
system behaves as if prediction markets don't exist. Even when wired up,
its output can only produce research notes and bounded confidence
adjustments (see strategies/prediction_market_signal.py) — never trades.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class MarketProbability:
    market: str            # human-readable market question
    probability: float     # 0.0 - 1.0 for the YES outcome
    source: str            # "polymarket" | "kalshi" | ...
    bearish_for_asset: bool


def fetch_probabilities(asset: str) -> list[MarketProbability]:
    """Fetch probabilities for markets relevant to an asset.

    Placeholder: returns [] until an API endpoint is configured AND a
    mapping from assets to relevant markets is curated by hand. Automatic
    market discovery is deliberately out of scope — a human decides which
    markets are relevant to which asset.
    """
    api_url = os.environ.get("POLYMARKET_API_URL", "").strip()
    if not api_url:
        return []
    # Future: httpx.get(f"{api_url}/markets?...") with curated market IDs.
    # Until that curation exists, return nothing rather than guess.
    return []
