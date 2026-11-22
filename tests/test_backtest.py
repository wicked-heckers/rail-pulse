from ml.run_backtest import run_50_run_benchmark


def test_50_run_corridor_backtest_benchmark():
    """
    Verifies that the RAIL-PULSE Cascade Engine delivers:
    1. > 50% MAE prediction error reduction vs Naive NTES baseline.
    2. >= 80% empirical coverage within the [P10, P90] uncertainty band.
    """
    metrics = run_50_run_benchmark()

    assert metrics["total_runs"] == 50
    assert metrics["mae_railpulse"] < metrics["mae_ntes"]
    assert metrics["error_reduction_pct"] >= 50.0, f"Expected >50% error reduction, got {metrics['error_reduction_pct']}%"
    assert metrics["coverage_p10_p90_pct"] >= 80.0, f"Expected >=80% coverage, got {metrics['coverage_p10_p90_pct']}%"
    assert metrics["rmse_railpulse"] < metrics["rmse_ntes"]
