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
