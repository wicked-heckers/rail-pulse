import pytest

from app.core.database import LocalTopologyFallback
from app.engine.overtake_sim import simulate_corridor_overtakes
from app.engine.rescue_engine import evaluate_connection_rescue
from app.models.schemas import TrainKinematicState


@pytest.fixture
def topology():
    return LocalTopologyFallback.load_topology()


def test_safe_boarding_guardrail_locks_pre_boarding(topology):
    """Verify pre-boarding passenger is never issued road bailout."""
    train_state = TrainKinematicState(
        train_no="12821",
        train_name="Dhauli Express",
        direction="DN",
        chainage_km=0.0,
        current_delay_mins=45.0,
    )

    res = evaluate_connection_rescue(
        train_state=train_state,
        destination_code="BBS",
        connection_deadline_epoch=1795076100,
        passenger_status="PRE_BOARDING",
        topology=topology,
    )

    assert res["safe_boarding_lock"] is True
    assert res["bailout_recommended"] is False
    assert "official schedule" in res["boarding_advisory"]


def test_early_junction_bailout_cuttack_to_bhubaneswar(topology):
    """
    Verify the calibrated SIH26028 demo case:
    Dhauli Express at Cuttack delayed 28 mins behind freight + Vande Bharat overtake at Barang.
    Connection deadline at BBS 12:10 PM with 15-min transfer buffer (cutoff 11:55 AM).
    Train P50 arrives at 11:56 AM (missed cutoff / survival < 40%).
    Deboarding at Cuttack + NH-16 cab reaches at 11:48 AM, saving time and making the connection!
    """
    dhauli = TrainKinematicState(
        train_no="12821",
        train_name="Dhauli Express",
        direction="DN",
        priority_rank=2,
        chainage_km=115.0,
        current_station="CTC",
        speed_kmph=0.0,
        current_delay_mins=28.0,
    )
    vande_bharat = TrainKinematicState(
        train_no="22895",
        train_name="Vande Bharat Express",
        direction="DN",
        priority_rank=1,
        chainage_km=60.0,
        speed_kmph=130.0,
        current_delay_mins=2.0,
    )
    freight = {"DN_CTC_BRAG": 20.0}

    # 1. Run simulation to get timeline, freight drag, and overtake at Barang
    sim_res = simulate_corridor_overtakes(
        target_train_no="12821",
        active_trains=[dhauli, vande_bharat],
        topology=topology,
        freight_penalties=freight,
        current_epoch=1795071480,  # 10:58 AM
    )

    # Connection deadline: 12:10 PM (72 mins from 10:58 AM)
    deadline_epoch = 1795071480 + (72 * 60)

    # 2. Evaluate rescue
    rescue_res = evaluate_connection_rescue(
        train_state=dhauli,
        destination_code="BBS",
        connection_deadline_epoch=deadline_epoch,
        transfer_buffer_mins=15,  # Effective cutoff = 11:55 AM
        passenger_status="ON_BOARD",
        sim_result=sim_res,
        topology=topology,
        current_epoch=1795071480,
    )

    assert rescue_res["risk_level"] == "HIGH_RISK_MISS"
    assert rescue_res["survival_probability_pct"] < 40.0
    assert rescue_res["bailout_recommended"] is True

    bailout = rescue_res["bailout_plan"]
    assert bailout is not None
    assert bailout["deboard_station_code"] == "CTC"
    assert bailout["deboard_station_name"] == "Cuttack Junction"
    assert "NH-16" in bailout["road_mode"]
    assert bailout["minutes_saved"] >= 5.0
    assert bailout["final_road_arrival_epoch"] <= (deadline_epoch - 15 * 60)


def test_osrm_road_route_fallback():
    """Verify OSRM route helper is exercised and degrades gracefully without throwing."""
    from app.engine.rescue_engine import get_osrm_road_route_sync

    result = get_osrm_road_route_sync((20.4625, 85.8829), (20.2667, 85.8333), timeout=0.1)
    assert result is None or (len(result) == 3 and result[0] > 0)


def test_rescue_applies_slack_and_matches_forecast_quantiles(topology):
    """Verify rescue engine applies sectional slack and feeds all 12 features consistently."""
    from app.engine.quantile_ml import QuantileMLEngine, build_quantile_feature_vector
    from app.engine.slack_adjuster import apply_slack_to_timeline

    dhauli = TrainKinematicState(
        train_no="12821",
        train_name="Dhauli Express",
        direction="DN",
        priority_rank=2,
        chainage_km=115.0,
        current_station="CTC",
        speed_kmph=0.0,
        current_delay_mins=28.0,
    )
    current_epoch = 1795071480
    sim_res = simulate_corridor_overtakes(
        target_train_no="12821",
        active_trains=[dhauli],
        topology=topology,
        freight_penalties={"DN_CTC_BRAG": 20.0},
        current_epoch=current_epoch,
    )
    adjusted = apply_slack_to_timeline(
        timeline=sim_res.timeline,
        track_blocks=topology.get("track_blocks", []),
        direction="DN",
        rain_mm_hr=10.0,
        freight_probability=0.85,
    )
    bbs_arr = next(a for a in adjusted if a.station_code == "BBS")
    expected_feat = build_quantile_feature_vector(
        train_state=dhauli,
        sim_result=sim_res,
        adjusted_timeline=adjusted,
        target_arrival=bbs_arr,
        remaining_km=abs(bbs_arr.chainage_km - dhauli.chainage_km),
        freight_shadow_prob=0.85,
        rain_mm_hr=10.0,
        current_epoch=current_epoch,
    )
    expected_q = QuantileMLEngine.predict(expected_feat, bbs_arr.sched_arr_epoch)

    rescue_res = evaluate_connection_rescue(
        train_state=dhauli,
        destination_code="BBS",
        connection_deadline_epoch=current_epoch + 72 * 60,
        sim_result=sim_res,
        topology=topology,
        current_epoch=current_epoch,
        rain_mm_hr=10.0,
        freight_shadow_prob=0.85,
    )
    assert rescue_res["train_p10_eta_epoch"] == expected_q.p10_eta_epoch
    assert rescue_res["train_p50_eta_epoch"] == expected_q.p50_eta_epoch
    assert rescue_res["train_p90_eta_epoch"] == expected_q.p90_eta_epoch


def test_khurda_road_junction_rescue_and_road_matrix(topology):
    """
    Verify Khurda Road Junction (KUR) road matrix routes and early junction rescue evaluation.
    """
    from app.core.database import LocalRoadMatrixFallback

    LocalRoadMatrixFallback.clear_cache()
    kur_to_bbs = LocalRoadMatrixFallback.get_route("KUR", "BBS")
    assert kur_to_bbs is not None
    assert kur_to_bbs["distance_km"] == 18.5
    assert "NH-16" in kur_to_bbs["highway_name"]

    kur_to_puri = LocalRoadMatrixFallback.get_route("KUR", "PURI")
    assert kur_to_puri is not None
    assert kur_to_puri["distance_km"] == 44.0
    assert "NH-316" in kur_to_puri["highway_name"]

    # Delayed train at Khurda Road (KUR) heading towards Bhubaneswar with tight connection
    jagannath = TrainKinematicState(
        train_no="18410",
        train_name="Sri Jagannath Express",
        direction="UP",
        priority_rank=3,
        chainage_km=162.0,
        current_station="KUR",
        speed_kmph=0.0,
        current_delay_mins=35.0,
    )
    current_epoch = 1795071480

    sim_res = simulate_corridor_overtakes(
        target_train_no="18410",
        active_trains=[jagannath],
        topology=topology,
        freight_penalties={"UP_KUR_BBS": 28.0},
        current_epoch=current_epoch,
    )

    # Tight connection deadline at BBS (36 mins from now): Train P50 takes ~41 mins, but road transfer from KUR beats it
    res = evaluate_connection_rescue(
        train_state=jagannath,
        destination_code="BBS",
        connection_deadline_epoch=current_epoch + int(36 * 60),
        transfer_buffer_mins=0.0,
        sim_result=sim_res,
        topology=topology,
        current_epoch=current_epoch,
        passenger_status="ON_BOARD",
    )

    assert res["safe_boarding_lock"] is False
    assert res["bailout_recommended"] is True
    plan = res["bailout_plan"]
    assert plan is not None
    assert plan["deboard_station_code"] == "KUR"
    assert "Khurda Road" in plan["deboard_station_name"]
    assert plan["destination_station_code"] == "BBS"
    assert plan["road_distance_km"] == 18.5
    assert plan["minutes_saved"] >= 10.0
