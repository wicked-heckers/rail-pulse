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
