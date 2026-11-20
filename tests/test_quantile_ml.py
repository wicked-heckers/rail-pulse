import pytest
from app.engine.quantile_ml import QuantileMLEngine, calculate_connection_survival
from app.models.schemas import QuantileFeatureVector


def test_quantile_booster_loading():
    """Verify that LightGBM boosters load successfully."""
    loaded = QuantileMLEngine.load_models()
    assert loaded is True


def test_monotonic_non_crossing_and_spread_guarantee():
    """Verify P10 <= P50 <= P90 is strictly enforced on all predictions."""
    features = QuantileFeatureVector(
        current_delay_mins=28.0,
        p50_base_delay_mins=35.0,
        freight_probability=0.85,
        overtake_count=1,
        overtake_mins=16.0,
        remaining_km=100.0,
        remaining_halts=3,
        usable_slack_mins=10.0,
        rain_mm_hr=15.0,
        hour_of_day=10,
        junction_congestion_idx=0.8,
    )

    sched_arr_epoch = 1795070000
    res = QuantileMLEngine.predict(features, sched_arr_epoch)

    # 1. Monotonicity check
    assert res.p10_delay_mins <= res.p50_delay_mins <= res.p90_delay_mins
    assert res.p10_eta_epoch <= res.p50_eta_epoch <= res.p90_eta_epoch

    # 2. Minimum spread check: for 100 km, min spread >= 6.0 mins
    assert (res.p90_delay_mins - res.p50_delay_mins) >= 6.0


def test_connection_survival_cdf_interpolation():
    """Verify continuous probability interpolation across P10 / P50 / P90."""
    p10_epoch = 1000
    p50_epoch = 2000
    p90_epoch = 3000

    # Cutoff before P10 -> survival <= 10%
    surv_pre_p10 = calculate_connection_survival(cutoff_epoch=800, p10_epoch=p10_epoch, p50_epoch=p50_epoch, p90_epoch=p90_epoch)
    assert surv_pre_p10 < 0.10

    # Cutoff exactly at P10 -> 10%
    surv_at_p10 = calculate_connection_survival(cutoff_epoch=1000, p10_epoch=p10_epoch, p50_epoch=p50_epoch, p90_epoch=p90_epoch)
    assert surv_at_p10 == pytest.approx(0.10, abs=0.01)

    # Cutoff at median P50 -> exactly 50%
    surv_at_p50 = calculate_connection_survival(cutoff_epoch=2000, p10_epoch=p10_epoch, p50_epoch=p50_epoch, p90_epoch=p90_epoch)
    assert surv_at_p50 == pytest.approx(0.50, abs=0.01)

    # Cutoff at P90 -> exactly 90%
    surv_at_p90 = calculate_connection_survival(cutoff_epoch=3000, p10_epoch=p10_epoch, p50_epoch=p50_epoch, p90_epoch=p90_epoch)
    assert surv_at_p90 == pytest.approx(0.90, abs=0.01)

    # Cutoff well after P90 -> >90%
    surv_post_p90 = calculate_connection_survival(cutoff_epoch=4000, p10_epoch=p10_epoch, p50_epoch=p50_epoch, p90_epoch=p90_epoch)
    assert surv_post_p90 > 0.90
