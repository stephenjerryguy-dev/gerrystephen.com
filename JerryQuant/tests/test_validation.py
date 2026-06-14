"""Validation-tooling tests: walk-forward, sensitivity, Monte Carlo."""

import numpy as np
import pytest

from backtesting import validation
from tests.conftest import make_config, trending_with_breakouts_df


@pytest.fixture
def cfg_single():
    # Single custom asset so the regime gate falls back to breadth-only and
    # the engine actually takes trades in tests.
    return make_config(watchlist={"crypto": [], "equities": ["TEST"]})


def test_walk_forward_splits_and_reports(cfg_single):
    data = {"TEST": trending_with_breakouts_df(400)}
    report = validation.walk_forward(data, cfg_single, n_windows=4)
    assert len(report.windows) == 4
    assert 0.0 <= report.consistency_pct <= 100.0
    assert "Walk-forward" in report.render()


def test_walk_forward_needs_history(cfg_single):
    data = {"TEST": trending_with_breakouts_df(400).head(5)}
    with pytest.raises(ValueError):
        validation.walk_forward(data, cfg_single, n_windows=4)


def test_parameter_sensitivity_sweeps_grid(cfg_single):
    data = {"TEST": trending_with_breakouts_df(400)}
    grid = {"fast_ma": [20, 50], "atr_stop_multiple": [1.5, 2.0]}
    points = validation.parameter_sensitivity(data, cfg_single, grid)
    assert len(points) == 4
    assert all("fast_ma" in p.params for p in points)
    assert "sensitivity" in validation.render_sensitivity(points).lower()


def test_parameter_sensitivity_skips_invalid_ma_order(cfg_single):
    data = {"TEST": trending_with_breakouts_df(400)}
    # fast >= slow is invalid and must be skipped, not crash.
    grid = {"fast_ma": [250], "slow_ma": [200]}
    assert validation.parameter_sensitivity(data, cfg_single, grid) == []


def test_monte_carlo_distribution():
    cfg = make_config()
    pnls = [5.0, -2.0, 3.0, -1.0, 4.0, -3.0, 2.0, 6.0, -2.0, 1.0]
    mc = validation.monte_carlo(pnls, 100.0, cfg, n_sims=1000)
    assert mc is not None
    assert mc.p5_return_pct <= mc.median_return_pct <= mc.p95_return_pct
    assert mc.p95_max_dd_pct >= mc.median_max_dd_pct
    assert 0.0 <= mc.prob_loss_pct <= 100.0
    assert "Monte Carlo" in mc.render()


def test_monte_carlo_needs_enough_trades():
    cfg = make_config()
    assert validation.monte_carlo([1.0, 2.0], 100.0, cfg) is None
