import pytest

from app.core.database import LocalTopologyFallback
from app.engine.slack_adjuster import apply_slack_to_timeline, calculate_usable_slack
from app.models.schemas import StationArrival


@pytest.fixture
def topology():
    return LocalTopologyFallback.load_topology()


def test_usable_slack_weather_discount():
    """Verify slack recovery efficiency is capped at 75% in heavy rain."""
    # Dry weather -> 100% of 40 mins slack is usable
    assert calculate_usable_slack(40.0, rain_mm_hr=0.0) == 40.0

    # Rain > 10 mm/hr -> 75% cap (30.0 mins usable)
    assert calculate_usable_slack(40.0, rain_mm_hr=12.5) == 30.0


def test_slack_subtraction_and_zero_delay_floor(topology):
    """
    Verify subtracting 35 mins slack from a 15 min delay
    clamps net delay strictly at 0.0 minutes (never negative).
    """
    blocks = topology["track_blocks"]
    sample_timeline = [
        StationArrival(
            station_code="KUR",
            station_name="Khurda Road Junction",
            chainage_km=162.0,
            sched_arr_epoch=1795075000,
            sched_dep_epoch=1795075300,
            projected_arr_epoch=1795075000 + 900,  # 15 mins late
            projected_dep_epoch=1795075300 + 900,
            raw_sim_delay_mins=15.0,
            net_delay_mins=15.0,
            is_commercial_halt=True,
        ),
        StationArrival(
            station_code="PURI",
            station_name="Puri Terminal",
            chainage_km=206.0,
            sched_arr_epoch=1795080000,
            sched_dep_epoch=1795080000,
            projected_arr_epoch=1795080000 + 900,  # 15 mins late
            projected_dep_epoch=1795080000 + 900,
            raw_sim_delay_mins=15.0,
            net_delay_mins=15.0,
            is_commercial_halt=True,
        ),
    ]

    adjusted = apply_slack_to_timeline(sample_timeline, blocks, direction="DN")

    # At PURI, cumulative slack is 10 (KUR) + 25 (PURI) = 35 mins
    # Raw delay 15 mins - 35 mins slack = -20 mins -> Clamped at 0.0 mins
    puri_arr = next(a for a in adjusted if a.station_code == "PURI")
    assert puri_arr.raw_sim_delay_mins == 15.0
    assert puri_arr.net_delay_mins == 0.0
    assert puri_arr.projected_arr_epoch >= puri_arr.sched_arr_epoch
