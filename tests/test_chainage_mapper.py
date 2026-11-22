import pytest

from app.core.database import LocalTopologyFallback
from app.engine.chainage_mapper import (
    chainage_to_lat_lon,
    compute_headways,
    get_block_for_chainage,
    project_lat_lon_to_chainage,
    separate_dwell_from_run,
)
from app.models.schemas import TrainKinematicState


@pytest.fixture
def topology():
    return LocalTopologyFallback.load_topology()


def test_station_coordinate_snapping(topology):
    """Verify that GPS coordinate at Cuttack snaps accurately to 115.0 km."""
    stations = topology["stations"]
    ctc = next(s for s in stations if s["station_code"] == "CTC")

    # Exact coordinate
    chainage = project_lat_lon_to_chainage(ctc["lat"], ctc["lon"], stations)
    assert chainage == pytest.approx(115.0, abs=0.1)

    # Slight GPS jitter (100 meters away)
    jittered_lat = ctc["lat"] + 0.0008
    jittered_lon = ctc["lon"] + 0.0008
    snapped = project_lat_lon_to_chainage(jittered_lat, jittered_lon, stations)
    assert snapped == pytest.approx(115.0, abs=0.5)


def test_chainage_to_lat_lon_roundtrip(topology):
    """Verify 1D chainage converts to lat/lon along the corridor accurately."""
    stations = topology["stations"]
    lat, lon = chainage_to_lat_lon(115.0, stations)
    assert lat == pytest.approx(20.4625, abs=0.01)
    assert lon == pytest.approx(85.8829, abs=0.01)


def test_separate_dwell_from_run():
    """Verify station dwell is separated from actual block running traversal."""
    # Train halts at Cuttack for 20 mins (e.g. 10:00 to 10:20), then runs to Barang arriving 10:32 (12 mins)
    arr_prev = 1795070000        # 10:00:00
    dep_prev = 1795070000 + 1200 # 10:20:00 (20 min dwell)
    arr_next = dep_prev + 720    # 10:32:00 (12 min block run)

    res = separate_dwell_from_run(arr_prev, dep_prev, arr_next, sched_dwell_mins=5)
    assert res["actual_dwell_mins"] == 20.0
    assert res["actual_block_run_mins"] == 12.0
    assert res["excess_dwell_mins"] == 15.0  # 20 - 5 = 15m excess dwell


def test_compute_headways_dn(topology):
    """Verify DN direction correctly identifies leading and trailing trains."""
    train_a = TrainKinematicState(
        train_no="12821",
        train_name="Dhauli Express",
        direction="DN",
        chainage_km=115.0,  # At Cuttack
        speed_kmph=0.0,
    )
    train_b = TrainKinematicState(
        train_no="22895",
        train_name="Vande Bharat",
        direction="DN",
        chainage_km=85.0,   # 30 km behind Dhauli Express
        speed_kmph=120.0,
    )

    headways = compute_headways([train_a, train_b], direction="DN")

    # For train_b (at 85 km), train_a (at 115 km) is PRECEDING
    info_b = headways["22895"]
    assert info_b.preceding_train_no == "12821"
    assert info_b.preceding_gap_km == pytest.approx(30.0, abs=0.1)
    assert info_b.preceding_gap_mins == pytest.approx(15.0, abs=0.5)

    # For train_a (at 115 km), train_b (at 85 km) is TRAILING
    info_a = headways["12821"]
    assert info_a.trailing_train_no == "22895"
    assert info_a.trailing_gap_km == pytest.approx(30.0, abs=0.1)


def test_get_block_for_chainage(topology):
    """Verify chainage maps to the correct track block."""
    blocks = topology["track_blocks"]
    block = get_block_for_chainage(120.0, "DN", blocks)
    assert block is not None
    assert block["block_id"] == "DN_CTC_BRAG"
    assert block["from_station"] == "CTC"
    assert block["to_station"] == "BRAG"
