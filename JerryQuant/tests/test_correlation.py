"""Correlation-aware exposure and sizing tests."""

import numpy as np
import pandas as pd

from database.models import Direction, Position
from risk import correlation
from tests.conftest import make_config


def _pos(asset, value=10.0, price=10.0):
    return Position(
        asset=asset, direction=Direction.LONG, size=value / price,
        entry_price=price, stop=price * 0.95, target=price * 1.1,
        opened_at=pd.Timestamp.now(tz="UTC").to_pydatetime(),
        strategy="t", dollar_risk=1.0,
    )


def _series(seed, n=120, drift=0.001, noise=0.01):
    rng = np.random.default_rng(seed)
    rets = drift + noise * rng.standard_normal(n)
    return pd.Series(100 * np.cumprod(1 + rets))


def test_cluster_lookup():
    cfg = make_config()
    assert correlation.cluster_for("BTC", cfg.risk.correlation.clusters) == "crypto"
    assert correlation.cluster_for("ETH-USD", cfg.risk.correlation.clusters) == "crypto"
    assert correlation.cluster_for("SPY", cfg.risk.correlation.clusters) == "equity_index"
    assert correlation.cluster_for("TSLA", cfg.risk.correlation.clusters) is None


def test_cluster_cap_blocks_overconcentration():
    cfg = make_config(risk={"correlation": {"max_cluster_pct": 40.0}})
    equity = 100.0
    open_positions = [_pos("BTC", value=30.0)]
    # Adding $20 of ETH -> crypto cluster 50% > 40% cap.
    viol = correlation.check_cluster_exposure(
        "ETH", 20.0, equity, open_positions, {"BTC": 10.0}, cfg
    )
    assert viol and "cluster" in viol[0]


def test_cluster_cap_allows_within_limit():
    cfg = make_config(risk={"correlation": {"max_cluster_pct": 40.0}})
    viol = correlation.check_cluster_exposure(
        "ETH", 5.0, 100.0, [_pos("BTC", value=10.0)], {"BTC": 10.0}, cfg
    )
    assert viol == []


def test_haircut_shrinks_correlated_addition():
    cfg = make_config(risk={"correlation": {
        "haircut_threshold": 0.5, "max_haircut": 0.5}})
    base = _series(1)
    # Nearly identical series -> high correlation -> haircut applied.
    closes = {"BTC": base, "ETH": base * 1.01}
    mult, note = correlation.correlation_haircut("ETH", [_pos("BTC")], closes, cfg)
    assert mult < 1.0
    assert note is not None


def test_no_haircut_for_uncorrelated():
    cfg = make_config(risk={"correlation": {"haircut_threshold": 0.6}})
    closes = {"AAA": _series(1), "BBB": _series(999)}
    mult, note = correlation.correlation_haircut(
        "BBB", [_pos("AAA")], closes, cfg
    )
    assert mult == 1.0
    assert note is None


def test_haircut_fallback_uses_static_cluster():
    # No return history -> assume same-cluster names are correlated.
    cfg = make_config(risk={"correlation": {
        "haircut_threshold": 0.6, "max_haircut": 0.4}})
    mult, note = correlation.correlation_haircut("ETH", [_pos("BTC")], {}, cfg)
    assert mult < 1.0  # crypto cluster fallback corr 0.8 > 0.6 threshold


def test_disabled_correlation_is_noop():
    cfg = make_config(risk={"correlation": {"enabled": False}})
    assert correlation.correlation_haircut("ETH", [_pos("BTC")], {}, cfg) == (1.0, None)
    assert correlation.check_cluster_exposure(
        "ETH", 99.0, 100.0, [_pos("BTC", value=50.0)], {"BTC": 10.0}, cfg
    ) == []
