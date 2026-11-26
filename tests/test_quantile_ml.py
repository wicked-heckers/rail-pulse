import pytest

from app.engine.quantile_ml import (
    QuantileMLEngine,
    build_quantile_feature_vector,
    calculate_connection_survival,
)
from app.models.schemas import (
    CausalCard,
    QuantileFeatureVector,
    SimulationResult,
    StationArrival,
    TrainKinematicState,
)


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


def test_peak_hour_auto_derivation_and_batch_prediction():
    """Verify is_peak_hour defaults to None, feature builder populates 12 features, and predict_batch matches predict."""
    peak_vec = QuantileFeatureVector(current_delay_mins=15.0, hour_of_day=9)
    assert peak_vec.is_peak_hour is None

    train = TrainKinematicState(
        train_no="12821",
        train_name="Dhauli Express",
        direction="DN",
        priority_rank=2,
        chainage_km=115.0,
        current_delay_mins=20.0,
    )
    arr = StationArrival(
        station_code="BBS",
        station_name="Bhubaneswar",
        chainage_km=143.0,
        sched_arr_epoch=1795070000,
        sched_dep_epoch=1795070300,
        projected_arr_epoch=1795071800,
        projected_dep_epoch=1795072100,
        raw_sim_delay_mins=40.0,
        net_delay_mins=30.0,
    )
    sim = SimulationResult(
        train_no="12821",
        direction="DN",
        timeline=[arr],
        overtakes_count=1,
        total_loop_hold_mins=16.0,
        causal_cards=[
            CausalCard(
                event="FREIGHT_SHADOW_DRAG",
                station_code="BRAG",
                station_name="Barang",
                added_delay_mins=12.0,
                human_message="Freight shadow drag",
            )
        ],
    )

    peak_feat = build_quantile_feature_vector(
        train_state=train,
        sim_result=sim,
        adjusted_timeline=[arr],
        target_arrival=arr,
        remaining_km=28.0,
        freight_shadow_prob=0.85,
        rain_mm_hr=10.0,
        current_epoch=1795070000 - 3600,  # 11:xx IST (peak)
    )
    assert peak_feat.sim_freight_penalty_mins == 12.0
    assert peak_feat.is_peak_hour == 1
    assert peak_feat.downstream_junction_load == 4.85

    offpeak_feat = build_quantile_feature_vector(
        train_state=train,
        sim_result=sim,
        adjusted_timeline=[arr],
        target_arrival=arr,
        remaining_km=28.0,
        freight_shadow_prob=0.85,
        rain_mm_hr=10.0,
        current_epoch=1795070000,  # 12:xx IST (off-peak)
    )
    assert offpeak_feat.is_peak_hour == 0
    assert offpeak_feat.downstream_junction_load == 2.35

    batch_res = QuantileMLEngine.predict_batch([(peak_feat, 1795070000), (offpeak_feat, 1795070500)])
    assert len(batch_res) == 2
    assert batch_res[0] == QuantileMLEngine.predict(peak_feat, 1795070000)
    assert batch_res[1] == QuantileMLEngine.predict(offpeak_feat, 1795070500)
    assert QuantileMLEngine.predict_batch([]) == []
