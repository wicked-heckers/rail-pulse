import pytest

from app.core.redis_client import RedisCircuitBreakerClient
from app.core.state_store import CorridorStateStore
from app.ingestion.demo_provider import DemoSimulationProvider
from app.ingestion.ulip_connector import ULIPFoisEnterpriseConnector
from app.models.schemas import TrainKinematicState

# ---------------------------------------------------------------------------
# Original 4 tests (shared base — identical in both branches)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# origin/main new tests: ReplayProvider + LivePoller cache/failover
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_replay_provider_loads_and_advances():
    """Verify ReplayProvider loads fallback_snapshots.json and advances trains in REPLAY mode."""
    from app.ingestion.replay_provider import ReplayProvider

    provider = ReplayProvider(speed_multiplier=10.0)
    snap = await provider.get_corridor_snapshot()

    assert snap["mode"] == "REPLAY"
    assert len(snap["trains"]) == 3
    assert len(snap["phantom_freights"]) == 1

    vb_before = next(t for t in snap["trains"] if t.train_no == "22895")
    await provider.advance_simulation(elapsed_wall_seconds=30.0)
    snap_after = await provider.get_corridor_snapshot()
    vb_after = next(t for t in snap_after["trains"] if t.train_no == "22895")

    assert vb_after.chainage_km > vb_before.chainage_km


@pytest.mark.asyncio
async def test_live_poller_120s_cache_and_failover(monkeypatch):
    """
    Verify LiveFeedProvider respects the 120s poll cache and _poll_initial_state
    automatically falls back to REPLAY when LIVE_POLLER upstream is unreachable.
    """
    from app.config import settings
    from app.ingestion.live_poller import LiveFeedProvider
    from app.main import _poll_initial_state

    poller = LiveFeedProvider(poll_interval_secs=120)
    calls = 0

    async def fake_trains():
        nonlocal calls
        calls += 1
        return [
            TrainKinematicState(
                train_no="22895",
                train_name="Vande Bharat",
                direction="DN",
                chainage_km=80.0,
                speed_kmph=130.0,
            )
        ]

    async def fake_weather():
        return {"rain_mm_hr": 0.0, "wind_speed_kmph": 10.0, "condition": "CLEAR"}

    monkeypatch.setattr(poller, "fetch_live_trains", fake_trains)
    monkeypatch.setattr(poller, "fetch_weather_update", fake_weather)

    snap1 = await poller.get_corridor_snapshot()
    snap2 = await poller.get_corridor_snapshot()
    assert calls == 1
    assert snap1["mode"] == "LIVE_POLLER"
    assert snap2 is snap1

    # Now verify automatic failover to REPLAY when LIVE_POLLER has no upstream URL
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER_MODE", "LIVE_POLLER")
    monkeypatch.setattr(settings, "LIVE_TRAIN_API_URL", None)
    active_mode = await _poll_initial_state()
    assert active_mode == "REPLAY"


# ---------------------------------------------------------------------------
# Sahil branch new tests: freight drag, overtake gating, clock, cause physics,
# BBS clock parity, Barang ETA stability
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_freight_slow_zone_slows_vande_bharat_and_restores_speed():
    """Verify Vande Bharat slows inside an active goods-train block and resumes after clearing it."""
    provider = DemoSimulationProvider(speed_multiplier=10.0)
    await provider.apply_causes(
        "22895",
        ["FREIGHT_BLOCKADE"],
        direct_delay_mins=0.0,
        freight_penalty_mins=20.0,
        rain_mm_hr=0.0,
    )

    # Place 22895 inside DN_CTC_BRAG (115.0..128.0 km)
    provider._trains["22895"]["chainage_km"] = 117.0
    provider._trains["22895"]["status"] = "RUNNING_NORMAL"
    provider._trains["22895"]["speed_kmph"] = 130.0
    provider._trains["22895"]["next_station"] = "BRAG"

    await provider.advance_simulation(elapsed_wall_seconds=1.0)
    vande = provider._trains["22895"]
    assert vande["status"] == "CRAWLING_FREIGHT_DRAG"
    assert vande["speed_kmph"] <= 32.0

    # Place near end of freight block and advance past BRAG (128.0, non-commercial pass-through for 22895)
    vande["chainage_km"] = 127.95
    await provider.advance_simulation(elapsed_wall_seconds=3.0)
    assert vande["chainage_km"] > 128.0
    assert vande["status"] == "RUNNING_HIGH_SPEED"
    assert vande["speed_kmph"] >= 130.0
    assert vande["next_station"] in {"BBS", "KUR", "PURI"}


@pytest.mark.asyncio
async def test_overtake_hold_is_gap_gated_until_vande_bharat_is_close():
    """Verify 12821 keeps normal speed when 22895 is >18 km behind and halts only when close."""
    provider = DemoSimulationProvider(speed_multiplier=10.0)
    provider._trains["22895"]["chainage_km"] = 60.0
    provider._trains["12821"]["chainage_km"] = 120.0
    provider._trains["12821"]["status"] = "RUNNING_NORMAL"
    provider._trains["12821"]["speed_kmph"] = 110.0

    await provider.trigger_live_overtake()
    await provider.advance_simulation(elapsed_wall_seconds=2.0)

    dhauli = provider._trains["12821"]
    assert dhauli["status"] == "RUNNING_NORMAL"
    assert dhauli["speed_kmph"] == 110.0
    assert dhauli["chainage_km"] > 120.0

    # Bring 22895 within 18 km of target loop and put 12821 just before loop
    target_km = provider._overtake_target_km
    provider._trains["22895"]["chainage_km"] = target_km - 10.0
    dhauli["chainage_km"] = target_km - 1.5
    await provider.advance_simulation(elapsed_wall_seconds=1.5)
    assert dhauli["speed_kmph"] <= 55.0

    # Advance until 12821 reaches and holds at loop while 22895 hasn't cleared +3 km yet
    dhauli["chainage_km"] = target_km - 0.1
    provider._trains["22895"]["chainage_km"] = target_km - 2.0
    await provider.advance_simulation(elapsed_wall_seconds=2.0)
    assert dhauli["status"] == "AT_STATION_HALT"
    assert dhauli["speed_kmph"] == 0.0

    # Once 22895 passes target_km + 3 km, 12821 is released back to normal speed
    provider._trains["22895"]["chainage_km"] = target_km + 4.0
    await provider.advance_simulation(elapsed_wall_seconds=2.0)
    assert dhauli["status"] == "RUNNING_NORMAL"
    assert dhauli["speed_kmph"] == 110.0
    assert not provider._hold_until_overtaken


@pytest.mark.asyncio
async def test_simulation_clock_scales_accurately_and_preserves_fractional_seconds():
    """Verify simulation clock starts at 11:25 AM IST, keeps fractional 1x ticks, and scales with 10x/30x."""
    provider = DemoSimulationProvider(speed_multiplier=1.0)
    assert provider.sim_clock_secs == 1795067700

    # Two 1.5s wall ticks at 1x must advance 3 full simulated seconds (not 2s from truncation)
    await provider.advance_simulation(elapsed_wall_seconds=1.5)
    await provider.advance_simulation(elapsed_wall_seconds=1.5)
    assert provider.sim_clock_secs == 1795067703

    await provider.set_speed_multiplier(30.0)
    await provider.advance_simulation(elapsed_wall_seconds=2.0)
    assert provider.sim_clock_secs == 1795067763


@pytest.mark.asyncio
async def test_cause_physics_slows_and_stops_train_then_resumes_original_speed():
    """Verify dropdown causes physically slow/stop only the target train and restore speed once delay finishes."""
    from app.engine.overtake_sim import simulate_corridor_overtakes

    provider = DemoSimulationProvider(speed_multiplier=10.0)

    # 1. Slowdown cause (TSR_MAINTENANCE +14m at 30 km/h) on 22895 only
    await provider.apply_causes(
        "22895",
        ["TSR_MAINTENANCE"],
        direct_delay_mins=14.0,
        freight_penalty_mins=0.0,
        rain_mm_hr=0.0,
    )
    assert provider._trains["22895"]["speed_kmph"] == 30.0
    assert provider._trains["22895"]["status"] == "TSR_CAUTION"
    assert provider._trains["18410"]["speed_kmph"] == 110.0

    # Advance through TSR zone (~20 sim mins = 120 wall secs at 10x)
    for _ in range(30):
        await provider.advance_simulation(elapsed_wall_seconds=4.5)

    assert provider.get_remaining_cause_delay("22895") == 0.0
    assert provider._trains["22895"]["speed_kmph"] == 130.0
    assert provider._trains["22895"]["status"] == "RUNNING_HIGH_SPEED"

    # 2. Full-stop cause (PLATFORM_HOLD +10m at 0 km/h) on UP train 18410 + ETA invariance check
    await provider.apply_causes(
        "18410",
        ["PLATFORM_HOLD"],
        direct_delay_mins=10.0,
        freight_penalty_mins=0.0,
        rain_mm_hr=0.0,
    )
    assert provider._trains["18410"]["speed_kmph"] == 0.0
    assert provider._trains["18410"]["status"] == "PLATFORM_HOLD"
    held_km = provider._trains["18410"]["chainage_km"]

    snap_start = await provider.get_corridor_snapshot()
    sim_start = simulate_corridor_overtakes(
        target_train_no="18410",
        active_trains=snap_start["trains"],
        topology=provider.topology,
        current_epoch=provider.sim_clock_secs,
        delay_shift_mins=provider.get_remaining_cause_delay("18410"),
    )

    # Advance 5 sim minutes (30 wall secs at 10x): train stays halted, ETA stays stable
    await provider.advance_simulation(elapsed_wall_seconds=30.0)
    assert provider._trains["18410"]["chainage_km"] == held_km
    assert provider._trains["18410"]["speed_kmph"] == 0.0

    snap_mid = await provider.get_corridor_snapshot()
    sim_mid = simulate_corridor_overtakes(
        target_train_no="18410",
        active_trains=snap_mid["trains"],
        topology=provider.topology,
        current_epoch=provider.sim_clock_secs,
        delay_shift_mins=provider.get_remaining_cause_delay("18410"),
    )
    assert abs(sim_mid.timeline[-1].projected_arr_epoch - sim_start.timeline[-1].projected_arr_epoch) <= 5

    # Advance remaining 5+ sim minutes: hold expires and 18410 resumes original 110 km/h speed
    await provider.advance_simulation(elapsed_wall_seconds=35.0)
    assert provider.get_remaining_cause_delay("18410") == 0.0
    assert provider._trains["18410"]["speed_kmph"] == 110.0
    assert provider._trains["18410"]["status"] == "RUNNING_NORMAL"
    assert provider._trains["18410"]["chainage_km"] < held_km


@pytest.mark.asyncio
async def test_predicted_bbs_arrival_matches_actual_simulation_clock_for_all_trains():
    """Verify rescue/forecast P50 ETA for BBS matches the exact simulated arrival clock across all 3 trains."""
    from app.engine.overtake_sim import simulate_corridor_overtakes
    from app.engine.rescue_engine import evaluate_connection_rescue
    from app.engine.slack_adjuster import apply_slack_to_timeline

    for t_no in ("12821", "22895", "18410"):
        provider = DemoSimulationProvider(speed_multiplier=30.0)
        snap = await provider.get_corridor_snapshot()
        target_state = next(t for t in snap["trains"] if t.train_no == t_no)
        sim = simulate_corridor_overtakes(
            target_train_no=t_no,
            active_trains=snap["trains"],
            topology=provider.topology,
            current_epoch=provider.sim_clock_secs,
        )
        adj = apply_slack_to_timeline(
            sim.timeline, provider.topology["track_blocks"], target_state.direction
        )
        bbs_stop = next(a for a in adj if a.station_code == "BBS")
        rescue = evaluate_connection_rescue(
            train_state=target_state,
            destination_code="BBS",
            connection_deadline_epoch=bbs_stop.sched_arr_epoch + 1800,
            passenger_status="ON_BOARD",
            sim_result=sim,
            topology=provider.topology,
            current_epoch=provider.sim_clock_secs,
            adjusted_timeline=adj,
        )
        predicted_bbs_epoch = rescue["train_p50_eta_epoch"]

        # Step physical simulation at 30x until train physically arrives at BBS (143.0 km)
        for _ in range(120):
            await provider.advance_simulation(elapsed_wall_seconds=1.5)
            cur_km = provider._trains[t_no]["chainage_km"]
            if (target_state.direction == "DN" and cur_km >= 143.0) or (
                target_state.direction == "UP" and cur_km <= 143.0
            ):
                break

        actual_arrival_epoch = provider.sim_clock_secs
        assert abs(actual_arrival_epoch - predicted_bbs_epoch) <= 90, (
            f"Train {t_no} arrived at {actual_arrival_epoch}, predicted {predicted_bbs_epoch}"
        )


@pytest.mark.asyncio
async def test_eta_does_not_jump_drastically_after_clearing_barang_freight_or_cascade():
    """Verify ETA stays consistent (no drastic jump) before/during/after Barang Jn freight drag & Scenario 1."""
    from app.engine.overtake_sim import simulate_corridor_overtakes
    from app.engine.rescue_engine import evaluate_connection_rescue
    from app.engine.slack_adjuster import apply_slack_to_timeline

    # 1. Clean baseline + FREIGHT_BLOCKADE on 12821
    p_freight = DemoSimulationProvider(speed_multiplier=30.0)
    await p_freight.apply_causes("12821", ["FREIGHT_BLOCKADE"], 0.0, 20.0, 0.0)
    etas_freight = []
    for _ in range(55):
        snap = await p_freight.get_corridor_snapshot()
        sim = simulate_corridor_overtakes(
            "12821", snap["trains"], p_freight.topology, freight_penalties={"DN_CTC_BRAG": 20.0}, current_epoch=p_freight.sim_clock_secs
        )
        adj = apply_slack_to_timeline(sim.timeline, p_freight.topology["track_blocks"], "DN", 0.0, 0.88)
        bbs = next(a for a in adj if a.station_code == "BBS")
        res = evaluate_connection_rescue(
            next(t for t in snap["trains"] if t.train_no == "12821"),
            "BBS", bbs.sched_arr_epoch + 1800, 15, "ON_BOARD", sim, p_freight.topology, p_freight.sim_clock_secs, freight_shadow_prob=0.88, adjusted_timeline=adj
        )
        etas_freight.append(res["train_p50_eta_epoch"])
        if p_freight._trains["12821"]["chainage_km"] >= 143.0:
            break
        await p_freight.advance_simulation(1.5)
    assert max(etas_freight) - min(etas_freight) <= 180
    assert abs(p_freight.sim_clock_secs - etas_freight[0]) <= 180

    # 2. Scenario 1 DHAULI_CASCADE (includes Barang freight + Barang loop hold for Vande Bharat)
    p_sc1 = DemoSimulationProvider(speed_multiplier=30.0, scenario_mode=True, scenario_name="DHAULI_CASCADE")
    etas_sc1 = []
    for _ in range(95):
        snap = await p_sc1.get_corridor_snapshot()
        holds = p_sc1.get_all_remaining_loop_holds()
        sim = simulate_corridor_overtakes(
            "12821",
            snap["trains"],
            p_sc1.topology,
            freight_penalties={"DN_CTC_BRAG": 20.0},
            current_epoch=p_sc1.sim_clock_secs,
            loop_hold_override_mins=holds.get("12821"),
        )
        adj = apply_slack_to_timeline(sim.timeline, p_sc1.topology["track_blocks"], "DN", 2.0, 0.88)
        bbs = next(a for a in adj if a.station_code == "BBS")
        res = evaluate_connection_rescue(
            next(t for t in snap["trains"] if t.train_no == "12821"),
            "BBS", bbs.sched_arr_epoch + 1800, 15, "ON_BOARD", sim, p_sc1.topology, p_sc1.sim_clock_secs, rain_mm_hr=2.0, freight_shadow_prob=0.88, adjusted_timeline=adj
        )
        etas_sc1.append(res["train_p50_eta_epoch"])
        if p_sc1._trains["12821"]["chainage_km"] >= 143.0:
            break
        await p_sc1.advance_simulation(1.5)
    assert max(etas_sc1) - min(etas_sc1) <= 240
    assert abs(p_sc1.sim_clock_secs - etas_sc1[0]) <= 240


@pytest.mark.asyncio
async def test_random_goods_train_slows_predicts_accuracy_and_adds_delay_only_after_prediction():
    """
    Verify random hidden goods train lifecycle:
    1. Placed randomly on track -> 0 delay, no phantom freight prediction before train arrives.
    2. Train reaches goods train -> slows down automatically (28 km/h) -> still 0 delay during AI analysis.
    3. AI model completes STR + Bayesian prediction -> accuracy predicted, phantom freight emitted, delay added.
    4. Once goods train clears into loop -> passenger train restores cruise speed with steady delay.
    """
    provider = DemoSimulationProvider(speed_multiplier=10.0)
    spawned = provider.spawn_random_goods_train(target_train_no="12821", seed=42)
    assert spawned["block_id"].startswith("DN_")

    snap0 = await provider.get_corridor_snapshot()
    dhauli0 = next(t for t in snap0["trains"] if t.train_no == "12821")
    assert snap0["phantom_freights"] == []
    assert dhauli0.current_delay_mins == 0.0
    assert dhauli0.speed_kmph == 110.0

    # Place 12821 just outside the 3 km slowdown zone first: stays full speed, 0 delay
    g = provider._hidden_goods_trains[0]
    provider._trains["12821"]["chainage_km"] = round(g["chainage_km"] - 4.5, 2)
    await provider.advance_simulation(elapsed_wall_seconds=0.3)
    snap_before = await provider.get_corridor_snapshot()
    dhauli_before = next(t for t in snap_before["trains"] if t.train_no == "12821")
    assert dhauli_before.speed_kmph == 110.0
    assert dhauli_before.current_delay_mins == 0.0
    assert snap_before["phantom_freights"] == []

    # Move 12821 into the 2 km slowdown zone behind goods train: slows down, AI analyzing (< 12s) -> STILL 0 delay!
    provider._trains["12821"]["chainage_km"] = round(g["chainage_km"] - 1.5, 2)
    await provider.advance_simulation(elapsed_wall_seconds=0.6)  # 6 sim secs at 10x (< 12s)
    snap_slowing = await provider.get_corridor_snapshot()
    dhauli_slowing = next(t for t in snap_slowing["trains"] if t.train_no == "12821")
    assert dhauli_slowing.speed_kmph == 28.0
    assert dhauli_slowing.status == "UNSCHEDULED_SLOWDOWN"
    assert dhauli_slowing.current_delay_mins == 0.0
    assert snap_slowing["phantom_freights"] == []

    # Advance past 12s observation threshold: AI model completes prediction -> delay & shadow added!
    await provider.advance_simulation(elapsed_wall_seconds=0.8)  # +8 sim secs -> 14s total
    snap_predicted = await provider.get_corridor_snapshot()
    dhauli_predicted = next(t for t in snap_predicted["trains"] if t.train_no == "12821")
    assert dhauli_predicted.status == "CRAWLING_FREIGHT_DRAG"
    assert dhauli_predicted.current_delay_mins > 0.0
    assert len(snap_predicted["phantom_freights"]) == 1
    shadow = snap_predicted["phantom_freights"][0]
    assert shadow.block_id == g["block_id"]
    assert 0.55 <= shadow.freight_probability <= 1.0
    assert shadow.str_value >= 1.5
    assert shadow.added_delay_mins > 0.0


@pytest.mark.asyncio
async def test_high_speed_warp_interval_station_halt_detection():
    """Verify train halts at scheduled station even when advancing at 30x/60x speed multiplier."""
    provider = DemoSimulationProvider(speed_multiplier=60.0)
    # Position Vande Bharat 1.0 km before CTC (115.0 km). At 60x speed and 130 km/h,
    # a 1.5s tick moves 3.25 km, which would skip a naive 0.8 km distance check.
    provider._trains["22895"]["chainage_km"] = 114.0
    provider._trains["22895"]["next_station"] = "CTC"
    provider._trains["22895"]["speed_kmph"] = 130.0
    provider._trains["22895"]["status"] = "RUNNING_HIGH_SPEED"

    await provider.advance_simulation(elapsed_wall_seconds=1.5)

    vande = provider._trains["22895"]
    assert vande["status"] == "AT_STATION_HALT"
    assert vande["current_station"] == "CTC"
    assert vande["speed_kmph"] == 0.0
    assert vande["chainage_km"] == 115.0


@pytest.mark.asyncio
async def test_terminus_arrival_and_automatic_cycle_turnaround():
    """Verify trains come to a full stop at terminal stations and smoothly turnaround after dwell."""
    provider = DemoSimulationProvider(speed_multiplier=10.0)
    # Advance DN trains close to Puri (206 km) and UP train close to Bhadrak (0 km)
    provider._trains["12821"]["chainage_km"] = 205.8
    provider._trains["12821"]["next_station"] = "PURI"
    provider._trains["22895"]["chainage_km"] = 205.8
    provider._trains["22895"]["next_station"] = "PURI"
    provider._trains["18410"]["chainage_km"] = 0.2
    provider._trains["18410"]["next_station"] = "BHC"

    await provider.advance_simulation(elapsed_wall_seconds=1.5)

    assert provider._trains["12821"]["status"] == "AT_TERMINUS"
    assert provider._trains["12821"]["current_station"] == "PURI"
    assert provider._trains["12821"]["speed_kmph"] == 0.0

    assert provider._trains["22895"]["status"] == "AT_TERMINUS"
    assert provider._trains["22895"]["current_station"] == "PURI"
    assert provider._trains["22895"]["speed_kmph"] == 0.0

    assert provider._trains["18410"]["status"] == "AT_TERMINUS"
    assert provider._trains["18410"]["current_station"] == "BHC"
    assert provider._trains["18410"]["speed_kmph"] == 0.0

    # Advance beyond 180 simulation seconds (e.g. 15 x 1.5s at 10x = 225s) to trigger cycle turnaround
    for _ in range(15):
        await provider.advance_simulation(elapsed_wall_seconds=1.5)

    # All trains must be smoothly reset to initial scenario positions
    assert provider._trains["12821"]["status"] != "AT_TERMINUS"
    assert provider._trains["22895"]["status"] != "AT_TERMINUS"
    assert provider._trains["18410"]["status"] != "AT_TERMINUS"


@pytest.mark.asyncio
async def test_live_overtake_delay_preservation_across_ticks():
    """Verify live overtake delay floor (16m) is preserved monotonically and does not drop on next tick."""
    provider = DemoSimulationProvider(speed_multiplier=1.0)
    overtake_res = await provider.trigger_live_overtake()
    assert overtake_res["status"] == "OVERTAKE_TRIGGERED"
    assert provider._trains["12821"]["delay_mins"] >= 16.0

    # Advance 10 ticks and ensure delay does not drop back to 0
    for _ in range(10):
        await provider.advance_simulation(elapsed_wall_seconds=1.5)
        assert provider._trains["12821"]["delay_mins"] >= 16.0


@pytest.mark.asyncio
async def test_khurda_road_junction_cascade_scenario():
    """Verify Khurda Road Junction (KUR) cascade scenario initializes and advances properly."""
    provider = DemoSimulationProvider(
        speed_multiplier=1.0,
        scenario_mode=True,
        scenario_name="KHURDA_CASCADE",
    )
    assert provider._trains["12821"]["current_station"] == "KUR"
    assert provider._trains["12821"]["chainage_km"] == 162.0
    assert provider._overtake_target_code == "KUR"
    assert provider._overtake_target_km == 162.0
    assert "DN_KUR_PURI" in provider._injected_freights

    snapshot = await provider.get_corridor_snapshot()
    assert "DEMO" in snapshot["mode"]
    dhauli = next(t for t in snapshot["trains"] if t.train_no == "12821")
    assert dhauli.current_station == "KUR"
    assert dhauli.speed_kmph == 0.0
