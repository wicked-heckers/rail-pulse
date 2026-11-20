import pytest
from app.core.redis_client import RedisCircuitBreakerClient
from app.core.state_store import CorridorStateStore
from app.ingestion.demo_provider import DemoSimulationProvider
from app.ingestion.ulip_connector import ULIPFoisEnterpriseConnector
from app.models.schemas import TrainKinematicState


@pytest.mark.asyncio
async def test_state_store_atomic_updates_and_delay_injection():
    """Verify in-process state store updates trains and applies judge injected delays."""
    store = CorridorStateStore()
    train = TrainKinematicState(
        train_no="12821",
        train_name="Dhauli Express",
        direction="DN",
        chainage_km=50.0,
        speed_kmph=80.0,
        current_delay_mins=10.0,
    )

    await store.update_trains([train])
    active = await store.get_active_trains()
    assert len(active) == 1
    assert active[0].current_delay_mins == 10.0

    # Inject +15 mins delay via judge slider
    await store.inject_train_delay("12821", additional_mins=15.0)
    active_after = await store.get_active_trains()
    assert active_after[0].current_delay_mins == 25.0


@pytest.mark.asyncio
async def test_demo_simulation_provider_snapshot_and_time_warp():
    """Verify demo simulation provider advances positions and emits valid snapshots."""
    provider = DemoSimulationProvider(speed_multiplier=10.0)
    snapshot = await provider.get_corridor_snapshot()

    assert "trains" in snapshot
    assert len(snapshot["trains"]) == 3
    assert "DEMO_10X" in snapshot["mode"]

    dhauli = next(t for t in snapshot["trains"] if t.train_no == "12821")
    assert dhauli.train_name == "Dhauli Express"
    assert dhauli.chainage_km == 115.0  # At Cuttack station

    # Advance time by 30 wall seconds (300 simulated seconds = 5 mins)
    await provider.advance_simulation(elapsed_wall_seconds=30.0)
    next_snap = await provider.get_corridor_snapshot()
    dhauli_after = next(t for t in next_snap["trains"] if t.train_no == "12821")
    # Train should have departed Cuttack and moved south towards Barang
    assert dhauli_after.chainage_km >= 115.0


@pytest.mark.asyncio
async def test_ulip_fois_enterprise_override():
    """Verify ULIP connector registers confirmed freight and updates state store."""
    payload = {
        "rake_id": "BOXN_TALCHER_9941",
        "block_id": "DN_CTC_BRAG",
        "direction": "DN",
        "speed_kmph": 28.5,
        "timestamp_utc": 1795071500,
    }

    result = await ULIPFoisEnterpriseConnector.process_freight_telemetry(payload)
    assert result.status == "ULIP_FOIS_CONFIRMED"
    assert result.freight_probability == 1.0
    assert result.block_id == "DN_CTC_BRAG"


@pytest.mark.asyncio
async def test_redis_circuit_breaker_resilience():
    """
    Verify that an unreachable Redis server does NOT throw 500 exceptions,
    but cleanly returns None while keeping the application fully alive.
    """
    # Point to a non-existent port
    bad_redis = RedisCircuitBreakerClient(redis_url="redis://localhost:9999/0")
    client = await bad_redis.get_client()
    assert client is None

    # Getting or setting snapshot must degrade silently
    snap = await bad_redis.get_snapshot()
    assert snap is None

    set_ok = await bad_redis.set_snapshot({"status": "ok"})
    assert set_ok is False
