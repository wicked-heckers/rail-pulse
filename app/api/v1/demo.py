from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import (
    CorridorStateStore,
    DemoSimulationProvider,
    get_demo_provider,
    get_state_store,
)
from app.models.schemas import (
    DemoDelayInjectRequest,
    DemoFreightInjectRequest,
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

    # Re-initialize provider to initial deterministic coordinates
    demo_provider.__init__(speed_multiplier=request.speed_multiplier)

    # Perform initial snapshot tick and populate state store
    snapshot = await demo_provider.tick()
    await state_store.update_trains(snapshot["trains"])
    await state_store.update_freight_shadows(snapshot["phantom_freights"])
    await state_store.update_weather(snapshot["weather"])

    active_trains = await state_store.get_active_trains()

    return {
        "status": "STARTED",
        "scenario": request.scenario_name,
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
    await state_store.update_trains(snapshot["trains"])
    await state_store.update_freight_shadows(snapshot["phantom_freights"])
    await state_store.update_weather(snapshot["weather"])

    return {
        "status": "RESET",
        "message": "Corridor reset to nominal scheduled state",
        "active_trains": len(snapshot["trains"]),
    }
