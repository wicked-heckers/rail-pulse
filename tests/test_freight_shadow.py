import pytest

from app.core.database import LocalTopologyFallback
from app.engine.freight_shadow import compute_str, evaluate_freight_probability


@pytest.fixture
def topology():
    return LocalTopologyFallback.load_topology()


def test_str_calculation():
    """Verify Sectional Traversal Ratio calculation."""
    # Free flow = 10 mins, Actual run = 18 mins -> STR = 1.8
    assert compute_str(18.0, 10.0) == 1.80
    assert compute_str(10.0, 10.0) == 1.00


def test_normal_speed_gate_a(topology):
    """Verify Gate A identifies normal speed when STR < 1.5."""
    blocks = topology["track_blocks"]
    block = next(b for b in blocks if b["block_id"] == "DN_BHC_JJKR")

    res = evaluate_freight_probability(block, str_value=1.20)
    assert res.status == "NORMAL_SPEED"
    assert res.freight_probability < 0.20


def test_coaching_congestion_gate_b(topology):
    """Verify Gate B classifies visible passenger congestion if train is within 15 mins ahead."""
    blocks = topology["track_blocks"]
    block = next(b for b in blocks if b["block_id"] == "DN_CTC_BRAG")

    # High STR (1.9), but another passenger train is only 8 mins ahead
    res = evaluate_freight_probability(block, str_value=1.90, head_gap_mins=8.0)
    assert res.status == "COACHING_CONGESTION"
    assert res.freight_probability <= 0.25


def test_static_tsr_filter_gate_c(topology):
    """Verify Gate C reclassifies persistent slow zones as TSR rather than freight."""
    blocks = topology["track_blocks"]
    block = next(b for b in blocks if b["block_id"] == "DN_JKPR_NRG")

    # Last 3 trains all had STR >= 1.6 on this block
    history = [1.65, 1.70, 1.60]
    res = evaluate_freight_probability(
        block, str_value=1.75, head_gap_mins=35.0, block_history=history
    )
    assert res.status == "STATIC_TSR_OR_SIGNAL_FAULT"
    assert res.freight_probability <= 0.20


def test_phantom_freight_detection_at_barang(topology):
    """Verify Barang coal merge triggers Phantom Freight Shadow on high STR."""
    stations = topology["stations"]
    blocks = topology["track_blocks"]
    block = next(b for b in blocks if b["block_id"] == "DN_CTC_BRAG")

    # High STR at Barang with no train ahead and clean history
    res = evaluate_freight_probability(
        block,
        str_value=1.85,
        head_gap_mins=45.0,
        block_history=[1.0, 1.1],
        stations=stations,
    )
    assert res.status == "PHANTOM_FREIGHT_SHADOW"
    assert res.freight_probability >= 0.75
    assert res.clearance_station == "BRAG"
    assert res.clearance_eta_mins is not None
    assert res.clearance_eta_mins > 0.0


def test_ulip_fois_confirmed_override(topology):
    """Verify enterprise ULIP FOIS confirmation sets probability to 1.0."""
    stations = topology["stations"]
    blocks = topology["track_blocks"]
    block = next(b for b in blocks if b["block_id"] == "DN_JJKR_JKPR")

    res = evaluate_freight_probability(
        block,
        str_value=1.0,  # Even with normal STR, enterprise data overrides
        ulip_confirmed=True,
        stations=stations,
    )
    assert res.status == "ULIP_FOIS_CONFIRMED"
    assert res.freight_probability == 1.0
