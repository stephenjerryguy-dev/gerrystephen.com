"""Sentiment data (X, Reddit, news, Web3) — placeholder at launch.

Sentiment NEVER triggers trades. It produces a bounded confidence
adjustment consumed by the signal aggregator, where positive sentiment is
additionally barred from rescuing a below-threshold signal.

Each source returns a score in [-1.0, 1.0] or None when unavailable.
Until real connectors are wired up (keys in .env), every source returns
None and the aggregate adjustment is 0.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SentimentReading:
    asset: str
    x_score: Optional[float] = None
    reddit_score: Optional[float] = None
    news_score: Optional[float] = None
    web3_score: Optional[float] = None
    notes: list[str] = field(default_factory=list)

    @property
    def available_scores(self) -> list[float]:
        return [
            s
            for s in (self.x_score, self.reddit_score, self.news_score, self.web3_score)
            if s is not None
        ]


def fetch_sentiment(asset: str) -> SentimentReading:
    reading = SentimentReading(asset=asset)
    if not os.environ.get("X_BEARER_TOKEN"):
        reading.notes.append("X sentiment: not configured")
    if not os.environ.get("REDDIT_CLIENT_ID"):
        reading.notes.append("Reddit sentiment: not configured")
    if not os.environ.get("NEWS_API_KEY"):
        reading.notes.append("News sentiment: not configured")
    reading.notes.append("Web3 sentiment: not configured")
    return reading


def confidence_adjustment(reading: SentimentReading, max_adjust: int) -> int:
    """Map average sentiment to a bounded integer adjustment.

    Requires at least two agreeing sources to produce any positive
    adjustment; a single strongly negative source is enough to subtract
    (asymmetric caution by design).
    """
    scores = reading.available_scores
    if not scores:
        return 0
    avg = sum(scores) / len(scores)
    if avg < -0.3:
        return max(-max_adjust, int(avg * max_adjust))
    if avg > 0.3 and len(scores) >= 2:
        return min(max_adjust, int(avg * max_adjust))
    return 0
