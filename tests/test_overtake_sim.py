import pytest
from app.core.database import LocalTopologyFallback
from app.engine.overtake_sim import simulate_corridor_overtakes
from app.models.schemas import TrainKinematicState


@pytest.fixture
def topology():
    return LocalTopologyFallback.load_topology()


def test_vande_bharat_overtakes_dhauli_express_at_cuttack(topology):
    """
    Verify standard SIH26028 demo case:
    12821 Dhauli Express (Rank 2) delayed 28 mins followed by
    22895 Vande Bharat Express (Rank 1) at 130 km/h schedules
    an overtake hold at Cuttack / Barang loop line.
    """
    dhauli = TrainKinematicState(
        train_no="12821",
        train_name="Dhauli Express",
        direction="DN",
        priority_rank=2,
        chainage_km=51.0,  # At Jakhapura
        speed_kmph=75.0,
        current_delay_mins=28.0,
    )
    vande_bharat = TrainKinematicState(
        train_no="22895",
        train_name="Vande Bharat Express",
        direction="DN",
        priority_rank=1,
        chainage_km=10.0,  # 41 km behind Dhauli
        speed_kmph=130.0,
        current_delay_mins=2.0,
    )

    sim_res = simulate_corridor_overtakes(
        target_train_no="12821",
        active_trains=[dhauli, vande_bharat],
        topology=topology,
        injected_delay_mins=0.0,
    )

    assert sim_res.overtakes_count >= 1
    assert sim_res.total_loop_hold_mins >= 16.0

    # Verify Causal Card is emitted with human explanation
    overtake_cards = [c for c in sim_res.causal_cards if c.event == "PRIORITY_OVERTAKE_HOLD"]
    assert len(overtake_cards) >= 1
    card = overtake_cards[0]
    assert "22895" in card.caused_by_train
    assert card.added_delay_mins == 16.0
    assert "Loop Line" in card.human_message


def test_no_overtake_when_trailing_train_has_lower_priority(topology):
    """Verify high-priority train is never held for a lower-priority trailing rake."""
    vande_bharat = TrainKinematicState(
        train_no="22895",
        train_name="Vande Bharat Express",
        direction="DN",
        priority_rank=1,
        chainage_km=60.0,
        speed_kmph=125.0,
        current_delay_mins=5.0,
    )
    dhauli = TrainKinematicState(
        train_no="12821",
        train_name="Dhauli Express",
        direction="DN",
        priority_rank=2,
        chainage_km=40.0,  # Trailing behind Vande Bharat
        speed_kmph=100.0,
        current_delay_mins=30.0,
    )

    sim_res = simulate_corridor_overtakes(
        target_train_no="22895",
        active_trains=[vande_bharat, dhauli],
        topology=topology,
    )

    # Priority 1 train must NOT be overtaken
    assert sim_res.overtakes_count == 0
    assert sim_res.total_loop_hold_mins == 0.0
