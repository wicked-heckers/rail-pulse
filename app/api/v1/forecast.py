import time
from typing import Any
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_state_store, get_topology, CorridorStateStore
from app.engine.overtake_sim import simulate_corridor_overtakes
from app.engine.quantile_ml import QuantileMLEngine
from app.engine.slack_adjuster import apply_slack_to_timeline
from app.models.schemas import ForecastResponse, QuantileFeatureVector, TrainKinematicState

router = APIRouter(tags=["Forecast"])


@router.get("/trains/{train_no}/forecast", response_model=ForecastResponse)
async def get_train_forecast(
    train_no: str,
    state_store: CorridorStateStore = Depends(get_state_store),
    topology: dict[str, Any] = Depends(get_topology),
) -> ForecastResponse:
    """
    Returns full predictive intelligence breakdown for a train:
    Naive NTES baseline, P10/P50/P90 Quantile ETAs, usable slack,
    Causal Cards explaining every minute of delay, and overtake schedule.
    """
    active_trains = await state_store.get_active_trains()
    target_train = next((t for t in active_trains if t.train_no == train_no), None)

    # If train is not currently running, check master topology schedule
    if not target_train:
        trains_master = {t["train_no"]: t for t in topology.get("trains", [])}
        if train_no not in trains_master:
            raise HTTPException(status_code=404, detail=f"Train {train_no} not found on ECoR corridor")

        master_info = trains_master[train_no]
        first_halt = master_info["halts"][0] if master_info.get("halts") else None
        start_km = 0.0 if master_info.get("direction") == "DN" else 206.0
        target_train = TrainKinematicState(
            train_no=train_no,
            train_name=master_info["train_name"],
            direction=master_info["direction"],
            priority_rank=master_info.get("priority_rank", 3),
            chainage_km=start_km,
            speed_kmph=0.0,
            current_delay_mins=0.0,
            status="SCHEDULED",
            next_station=first_halt["station_code"] if first_halt else None,
        )
        active_trains.append(target_train)

    freight_penalties = await state_store.get_freight_penalties()
    snapshot = await state_store.get_snapshot()
    weather = snapshot.get("weather", {})
    rain_mm_hr = float(weather.get("rain_mm_hr", 0.0))

    # Determine highest freight probability for this train's path
    max_freight_prob = 0.0
    for shadow in snapshot.get("phantom_freights", []):
        if shadow.get("direction") == target_train.direction:
            max_freight_prob = max(max_freight_prob, float(shadow.get("freight_probability", 0.0)))

    # 1. Deterministic forward simulation of loop overtakes & freight drag
    sim_result = simulate_corridor_overtakes(
        target_train_no=train_no,
        active_trains=active_trains,
        topology=topology,
        freight_penalties=freight_penalties,
    )

    # 2. Subtract usable timetable recovery slack with intermediate floor clamp
    adjusted_timeline = apply_slack_to_timeline(
        timeline=sim_result.timeline,
        track_blocks=topology.get("track_blocks", []),
        direction=target_train.direction,
        rain_mm_hr=rain_mm_hr,
        freight_probability=max_freight_prob,
    )

    # 3. Identify destination arrival
    dest_arr = adjusted_timeline[-1] if adjusted_timeline else None
    sched_arr_epoch = dest_arr.sched_arr_epoch if dest_arr else int(time.time() + 3600)
    p50_base_delay = dest_arr.net_delay_mins if dest_arr else target_train.current_delay_mins
    dest_km = dest_arr.chainage_km if dest_arr else (206.0 if target_train.direction == "DN" else 0.0)
    remaining_km = max(5.0, abs(dest_km - target_train.chainage_km))

    # Calculate usable recovery slack redeemed
    usable_slack = sum(max(0.0, a.raw_sim_delay_mins - a.net_delay_mins) for a in adjusted_timeline)

    # 4. Predict quantiles via ML engine
    feat = QuantileFeatureVector(
        current_delay_mins=target_train.current_delay_mins,
        p50_base_delay_mins=p50_base_delay,
        freight_probability=max_freight_prob,
        overtake_count=sim_result.overtakes_count,
        overtake_mins=sim_result.total_loop_hold_mins,
        remaining_km=remaining_km,
        remaining_halts=len(adjusted_timeline),
        usable_slack_mins=usable_slack,
        rain_mm_hr=rain_mm_hr,
    )
    quantiles = QuantileMLEngine.predict(feat, sched_arr_epoch)

    # 5. Naive NTES Baseline Calculation
    naive_ntes_delay_mins = target_train.current_delay_mins
    naive_ntes_eta_epoch = sched_arr_epoch + int(naive_ntes_delay_mins * 60)

    # Collect causal cards
    causal_cards = list(sim_result.causal_cards)
    for arr in adjusted_timeline:
        causal_cards.extend(arr.causal_cards)

    # Deduplicate causal cards by human_message
    unique_cards = []
    seen_messages = set()
    for card in causal_cards:
        if card.human_message not in seen_messages:
            seen_messages.add(card.human_message)
            unique_cards.append(card)

    return ForecastResponse(
        train_no=target_train.train_no,
        train_name=target_train.train_name,
        direction=target_train.direction,
        current_chainage_km=target_train.chainage_km,
        current_delay_mins=target_train.current_delay_mins,
        naive_ntes_eta_epoch=naive_ntes_eta_epoch,
        naive_ntes_delay_mins=naive_ntes_delay_mins,
        p10_eta_epoch=quantiles.p10_eta_epoch,
        p50_eta_epoch=quantiles.p50_eta_epoch,
        p90_eta_epoch=quantiles.p90_eta_epoch,
        p10_delay_mins=quantiles.p10_delay_mins,
        p50_delay_mins=quantiles.p50_delay_mins,
        p90_delay_mins=quantiles.p90_delay_mins,
        usable_slack_mins=round(usable_slack, 1),
        station_timeline=adjusted_timeline,
        causal_cards=unique_cards,
        overtakes_count=sim_result.overtakes_count,
    )
