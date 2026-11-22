from app.core.database import LocalRoadMatrixFallback, LocalTopologyFallback
from app.models.db_models import StationModel, TrainMasterModel


def test_seed_topology_loads_correctly():
    """Verify that the local fallback seed topology loads and has valid geography."""
    data = LocalTopologyFallback.load_topology()
    assert "stations" in data
    assert "track_blocks" in data
    assert "trains" in data

    stations = data["stations"]
    assert len(stations) == 9

    # Verify physical chainage order from Bhadrak to Puri
    expected_order = ["BHC", "JJKR", "JKPR", "NRG", "CTC", "BRAG", "BBS", "KUR", "PURI"]
    actual_order = [s["station_code"] for s in stations]
    assert actual_order == expected_order

    # Verify chainage is strictly strictly increasing
    chainages = [s["chainage_km"] for s in stations]
    assert chainages == sorted(chainages)
    assert chainages[0] == 0.0
    assert chainages[-1] == 206.0


def test_track_blocks_directional_isolation():
    """Verify that UP and DN blocks are segregated and cover the corridor."""
    data = LocalTopologyFallback.load_topology()
    blocks = data["track_blocks"]

    dn_blocks = [b for b in blocks if b["direction"] == "DN"]
    up_blocks = [b for b in blocks if b["direction"] == "UP"]

    assert len(dn_blocks) == 8
    assert len(up_blocks) == 8

    # DN blocks must start at 0.0 and end at 206.0
    assert dn_blocks[0]["start_km"] == 0.0
    assert dn_blocks[-1]["end_km"] == 206.0

    # Barang and Jakhapura must carry heavy freight injection weight
    jkpr_block = next(b for b in dn_blocks if "JKPR" in b["block_id"])
    brag_block = next(b for b in dn_blocks if "BRAG" in b["block_id"])
    assert jkpr_block["freight_injection_weight"] >= 0.80
    assert brag_block["freight_injection_weight"] >= 0.80


def test_seed_road_matrix_cuttack_to_bhubaneswar():
    """Verify pre-cached OSRM highway route from Cuttack to Bhubaneswar."""
    route = LocalRoadMatrixFallback.get_route("CTC", "BBS")
    assert route is not None
    assert route["highway_name"] == "NH-16 (Cuttack-Bhubaneswar Expressway)"
    assert route["distance_km"] == 28.4
    assert route["base_drive_mins"] == 38.0
    assert route["typical_peak_drive_mins"] == 48.0
    assert route["station_exit_penalty_mins"] == 12.0
    assert len(route["polyline"]) > 20


def test_orm_model_instantiation():
    """Verify that SQLAlchemy ORM models instantiate without schema errors."""
    stn = StationModel(
        station_code="CTC",
        station_name="Cuttack Junction",
        chainage_km=115.0,
        lat=20.4625,
        lon=85.8829,
        has_750m_goods_loop=True,
        passenger_loops_dn=3,
        passenger_loops_up=3,
        is_major_junction=True,
        road_exit_penalty_m=12,
    )
    assert stn.station_code == "CTC"
    assert stn.chainage_km == 115.0

    train = TrainMasterModel(
        train_no="12821",
        train_name="Dhauli Express",
        train_class="SUPERFAST",
        priority_rank=2,
        direction="DN",
        max_speed_kmph=110,
    )
    assert train.train_no == "12821"
    assert train.priority_rank == 2
