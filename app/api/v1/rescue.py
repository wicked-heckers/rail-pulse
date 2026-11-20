import asyncio
import time
from typing import Any
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_state_store, get_topology, CorridorStateStore
from app.engine.overtake_sim import simulate_corridor_overtakes
from app.engine.rescue_engine import evaluate_connection_rescue
from app.models.schemas import RescueEvaluateRequest

router = APIRouter(tags=["Rescue"])


@router.post("/evaluate")
async def evaluate_rescue(
    request: RescueEvaluateRequest,
    state_store: CorridorStateStore = Depends(get_state_store),
    topology: dict[str, Any] = Depends(get_topology),
) -> dict[str, Any]:
    """
    Evaluates connection survival probability and triggers multi-modal road bailout
    if train survival drops below 40% (unless locked by Safe-Boarding Guardrail).
    """
    active_trains = await state_store.get_active_trains()
    target_train = next((t for t in active_trains if t.train_no == request.train_no), None)

    if not target_train:
        raise HTTPException(
            status_code=404,
            detail=f"Train {request.train_no} not actively found on corridor to evaluate rescue",
        )

    freight_penalties = await state_store.get_freight_penalties()
    snapshot = await state_store.get_snapshot()
    current_epoch = snapshot.get("tick_utc", int(time.time()))

    # Run physics simulator in worker thread
    sim_result = await asyncio.to_thread(
        simulate_corridor_overtakes,
        target_train_no=request.train_no,
        active_trains=active_trains,
        topology=topology,
        freight_penalties=freight_penalties,
        current_epoch=current_epoch,
    )

    # Evaluate rescue decision in worker thread
    result = await asyncio.to_thread(
        evaluate_connection_rescue,
        train_state=target_train,
        destination_code=request.destination_code,
        connection_deadline_epoch=request.connection_deadline_utc,
        transfer_buffer_mins=request.transfer_buffer_mins,
        passenger_status=request.passenger_status,
        sim_result=sim_result,
        topology=topology,
        current_epoch=current_epoch,
    )


    return result
