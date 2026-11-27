from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import (
    CorridorStateStore,
    DemoSimulationProvider,
    get_demo_provider,
    get_state_store,
)
from app.core.database import LocalTopologyFallback
from app.engine.disruption_causes import (
    DISRUPTION_CAUSE_CATALOG,
    compute_causes_impact,
)
from app.models.schemas import (
    DemoApplyCausesRequest,
    DemoDelayInjectRequest,
    DemoFreightInjectRequest,
    DemoRandomFreightRequest,
    DemoScenarioStartRequest,
    DemoSpeedRequest,
)

router = APIRouter(tags=["Demo & Simulation Controls"])


@router.post("/scenario/start")
async def start_demo_scenario(
    request: DemoScenarioStartRequest,
    state_store: CorridorStateStore = Depends(get_state_store),
    demo_provider: DemoSimulationProvider = Depends(get_demo_provider),
) -> dict[str, Any]:
    """
    Resets corridor state and initializes the deterministic judge demo scenario
    (Dhauli Express at Cuttack, Vande Bharat overtaking, and Barang freight drag).
    """
    await state_store.reset()
    await demo_provider.set_speed_multiplier(request.speed_multiplier)

    # Re-initialize provider to requested scenario coordinates
    active_cid = LocalTopologyFallback.get_active_corridor_id()
    chosen_scenario = request.scenario_id or request.scenario_name
    demo_provider.__init__(
        speed_multiplier=request.speed_multiplier,
        scenario_mode=True,
        scenario_name=chosen_scenario,
        corridor_id=active_cid,
    )

    # Perform initial snapshot tick and populate state store
    snapshot = await demo_provider.tick()
    await state_store.set_remaining_cause_delays(
        demo_provider.get_all_remaining_cause_delays(),
        demo_provider.get_all_remaining_loop_holds(),
    )
    await state_store.set_speed_multiplier(demo_provider.speed_multiplier)
    await state_store.update_trains(snapshot["trains"])
    await state_store.update_freight_shadows(snapshot["phantom_freights"])
    await state_store.update_goods_rakes(snapshot.get("goods_rakes", []))
    await state_store.update_weather(snapshot["weather"])

    active_trains = await state_store.get_active_trains()

    return {
        "status": "STARTED",
        "scenario": chosen_scenario,
        "scenario_id": chosen_scenario,
        "corridor_id": active_cid,
        "speed_multiplier": request.speed_multiplier,
        "active_trains": len(active_trains),
        "tick_utc": snapshot["tick_utc"],
    }


@router.post("/inject-delay")
async def inject_train_delay(
    request: DemoDelayInjectRequest,
    state_store: CorridorStateStore = Depends(get_state_store),
    demo_provider: DemoSimulationProvider = Depends(get_demo_provider),
) -> dict[str, Any]:
    """
    Simulates a real-time dispatch disruption by injecting delay onto a target train.
    """
    await demo_provider.inject_delay(request.train_no, request.added_delay_mins)
    await state_store.inject_train_delay(request.train_no, request.added_delay_mins)

    active_trains = await state_store.get_active_trains()
    target_train = next((t for t in active_trains if t.train_no == request.train_no), None)
    new_delay = target_train.current_delay_mins if target_train else request.added_delay_mins

    return {
        "status": "DELAY_INJECTED",
        "train_no": request.train_no,
        "added_delay_mins": request.added_delay_mins,
        "new_delay_mins": new_delay,
    }


@router.post("/speed")
async def update_simulation_speed(
    request: DemoSpeedRequest,
    state_store: CorridorStateStore = Depends(get_state_store),
    demo_provider: DemoSimulationProvider = Depends(get_demo_provider),
) -> dict[str, Any]:
    """
    Changes time-warp speed multiplier (e.g. 1x real-time, 10x demo, 30x fast-forward).
    """
    await demo_provider.set_speed_multiplier(request.speed_multiplier)
    await state_store.set_speed_multiplier(request.speed_multiplier)

    return {
        "status": "SPEED_UPDATED",
        "speed_multiplier": request.speed_multiplier,
    }


@router.post("/inject-freight")
async def inject_freight_shadow(
    request: DemoFreightInjectRequest,
    state_store: CorridorStateStore = Depends(get_state_store),
    demo_provider: DemoSimulationProvider = Depends(get_demo_provider),
) -> dict[str, Any]:
    """
    Simulates a freight blockage disruption (e.g. iron-ore or coal rake) in a specific block.
    """
    await demo_provider.inject_freight(request.block_id, request.confidence, request.penalty_mins)
    await state_store.inject_freight_shadow(request.block_id, request.penalty_mins, request.confidence)

    return {
        "status": "FREIGHT_INJECTED",
        "block_id": request.block_id,
        "penalty_mins": request.penalty_mins,
        "confidence": request.confidence,
    }


@router.post("/random-freight")
async def spawn_random_goods_train_endpoint(
    request: DemoRandomFreightRequest | None = None,
    state_store: CorridorStateStore = Depends(get_state_store),
    demo_provider: DemoSimulationProvider = Depends(get_demo_provider),
) -> dict[str, Any]:
    """
    Places an undetected goods train randomly on an upcoming track block.
    It adds zero delay until a passenger train reaches it, slows down automatically,
    and the AI STR + Bayesian model predicts accuracy & adds delay.
    """
    req = request or DemoRandomFreightRequest()
    spawned = demo_provider.spawn_random_goods_train(
        target_train_no=req.target_train_no,
        block_id=req.block_id,
        seed=req.seed,
        auto_respawn=True,
    )
    snap = await demo_provider.tick()
    await state_store.update_trains(snap["trains"])
    await state_store.update_freight_shadows(snap["phantom_freights"])
    await state_store.update_goods_rakes(snap.get("goods_rakes", []))

    return {
        "status": "RANDOM_GOODS_TRAIN_PLACED",
        **spawned,
    }


@router.post("/reset")
async def reset_corridor_state(
    state_store: CorridorStateStore = Depends(get_state_store),
    demo_provider: DemoSimulationProvider = Depends(get_demo_provider),
) -> dict[str, Any]:
    """
    Resets corridor state, active delays, and injected freights to nominal timetable.
    """
    await state_store.reset()
    demo_provider.__init__(speed_multiplier=1.0)
    snapshot = await demo_provider.tick()
    await state_store.set_remaining_cause_delays(
        demo_provider.get_all_remaining_cause_delays(),
        demo_provider.get_all_remaining_loop_holds(),
    )
    await state_store.set_speed_multiplier(demo_provider.speed_multiplier)
    await state_store.update_trains(snapshot["trains"])
    await state_store.update_freight_shadows(snapshot["phantom_freights"])
    await state_store.update_goods_rakes(snapshot.get("goods_rakes", []))
    await state_store.update_weather(snapshot["weather"])

    return {
        "status": "RESET",
        "message": "Corridor reset to nominal scheduled state",
        "active_trains": len(snapshot["trains"]),
    }


@router.get("/causes")
async def list_disruption_causes(
    train_no: str | None = None,
    state_store: CorridorStateStore = Depends(get_state_store),
) -> dict[str, Any]:
    """Lists all selectable disruption causes and optionally a train's active causes."""
    active_causes = await state_store.get_train_causes(train_no) if train_no else []
    return {
        "catalog": list(DISRUPTION_CAUSE_CATALOG.values()),
        "active_causes": active_causes,
    }


@router.post("/apply-causes")
async def apply_disruption_causes(
    request: DemoApplyCausesRequest,
    state_store: CorridorStateStore = Depends(get_state_store),
    demo_provider: DemoSimulationProvider = Depends(get_demo_provider),
) -> dict[str, Any]:
    """
    Applies a multi-cause disruption set to any train (validates against catalog,
    updates weather/freight shadows and cumulative delay without double-counting).
    """
    valid_causes = list(dict.fromkeys(c for c in request.causes if c in DISRUPTION_CAUSE_CATALOG))
    direct_delay, freight_penalty, rain_mm = compute_causes_impact(valid_causes)

    new_delay = await demo_provider.apply_causes(
        request.train_no, valid_causes, direct_delay, freight_penalty, rain_mm
    )
    remaining_delay = demo_provider.get_remaining_cause_delay(request.train_no)
    await state_store.set_train_causes(
        request.train_no, valid_causes, direct_delay, remaining_delay_mins=remaining_delay
    )

    snap = await demo_provider.tick()
    await state_store.update_trains(snap["trains"])
    await state_store.update_freight_shadows(snap["phantom_freights"])
    await state_store.update_weather(snap["weather"])

    return {
        "status": "CAUSES_APPLIED",
        "train_no": request.train_no,
        "active_causes": valid_causes,
        "direct_delay_mins": direct_delay,
        "freight_penalty_mins": freight_penalty,
        "rain_mm_hr": snap["weather"]["rain_mm_hr"],
        "new_delay_mins": new_delay,
    }


@router.post("/trigger-overtake")
async def trigger_live_overtake_endpoint(
    state_store: CorridorStateStore = Depends(get_state_store),
    demo_provider: DemoSimulationProvider = Depends(get_demo_provider),
) -> dict[str, Any]:
    """
    Applies a live priority overtake hold at the next upcoming loop station
    without resetting or teleporting current train coordinates.
    """
    info = await demo_provider.trigger_live_overtake()
    snap = await demo_provider.tick()
    await state_store.update_trains(snap["trains"])
    return info
