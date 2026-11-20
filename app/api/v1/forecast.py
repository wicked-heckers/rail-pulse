import asyncio
import time
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_state_store, get_topology, CorridorStateStore
from app.engine.overtake_sim import simulate_corridor_overtakes
from app.engine.quantile_ml import QuantileMLEngine
from app.engine.rescue_engine import evaluate_connection_rescue
from app.engine.slack_adjuster import apply_slack_to_timeline
from app.models.schemas import (
    ForecastResponse,
    PredictCascadeRequest,
    PredictCascadeResponse,
    QuantileFeatureVector,
    TrainKinematicState,
)

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
    sim_result = await asyncio.to_thread(
        simulate_corridor_overtakes,
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
    quantiles = await asyncio.to_thread(QuantileMLEngine.predict, feat, sched_arr_epoch)


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


@router.post("/predict-cascade", response_model=PredictCascadeResponse)
async def predict_cascade_unified(
    request: PredictCascadeRequest,
    state_store: CorridorStateStore = Depends(get_state_store),
    topology: dict[str, Any] = Depends(get_topology),
) -> PredictCascadeResponse:
    """
    Unified Section 7.2 Specification Parity Endpoint:
    Accepts train number, injected delay, and connection target.
    Returns composite prediction: Naive NTES ETA, P10/P50/P90 Quantile Bands,
    Overtake Alerts, Freight Shadow status, and Connection Audit.
    """
    train_no = request.train_number
    active_trains = await state_store.get_active_trains()
    target_train = next((t for t in active_trains if t.train_no == train_no), None)

    if not target_train:
        trains_master = {t["train_no"]: t for t in topology.get("trains", [])}
        if train_no not in trains_master:
            raise HTTPException(status_code=404, detail=f"Train {train_no} not found")

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
            current_delay_mins=request.injected_delay_mins,
            status="SCHEDULED",
            next_station=first_halt["station_code"] if first_halt else None,
        )
        active_trains.append(target_train)
    else:
        if request.current_station:
            stations_map = {s["station_code"]: s for s in topology.get("stations", [])}
            if request.current_station in stations_map:
                target_train.current_station = request.current_station
                target_train.chainage_km = stations_map[request.current_station]["chainage_km"]

    freight_penalties = await state_store.get_freight_penalties()

    snapshot = await state_store.get_snapshot()
    current_epoch = snapshot.get("tick_utc", int(time.time()))
    weather = snapshot.get("weather", {})
    rain_mm_hr = float(weather.get("rain_mm_hr", 0.0))

    # 1. Simulate overtakes
    sim_result = await asyncio.to_thread(
        simulate_corridor_overtakes,
        target_train_no=train_no,
        active_trains=active_trains,
        topology=topology,
        injected_delay_mins=request.injected_delay_mins,
        freight_penalties=freight_penalties,
        current_epoch=current_epoch,
    )

    # 2. Apply slack
    max_freight_prob = 0.0
    active_freight_shadow = None
    for shadow in snapshot.get("phantom_freights", []):
        if shadow.get("direction") == target_train.direction:
            prob = float(shadow.get("freight_probability", 0.0))
            if prob > max_freight_prob:
                max_freight_prob = prob
                active_freight_shadow = shadow

    adjusted_timeline = apply_slack_to_timeline(
        timeline=sim_result.timeline,
        track_blocks=topology.get("track_blocks", []),
        direction=target_train.direction,
        rain_mm_hr=rain_mm_hr,
        freight_probability=max_freight_prob,
    )

    # 3. Identify target station
    target_stn_code = (
        request.connection_target.station_code
        if request.connection_target
        else (adjusted_timeline[-1].station_code if adjusted_timeline else "BBS")
    )
    target_arrival = next(
        (a for a in adjusted_timeline if a.station_code == target_stn_code),
        adjusted_timeline[-1] if adjusted_timeline else None,
    )

    sched_arr_epoch = target_arrival.sched_arr_epoch if target_arrival else current_epoch + 3600
    p50_base_delay = target_arrival.net_delay_mins if target_arrival else target_train.current_delay_mins
    target_km = target_arrival.chainage_km if target_arrival else 143.0
    remaining_km = max(5.0, abs(target_km - target_train.chainage_km))

    # 4. Predict quantiles
    feat = QuantileFeatureVector(
        current_delay_mins=target_train.current_delay_mins,
        p50_base_delay_mins=p50_base_delay,
        freight_probability=max_freight_prob,
        overtake_count=sim_result.overtakes_count,
        overtake_mins=sim_result.total_loop_hold_mins,
        remaining_km=remaining_km,
        remaining_halts=len(adjusted_timeline),
        usable_slack_mins=sum(max(0.0, a.raw_sim_delay_mins - a.net_delay_mins) for a in adjusted_timeline),
        rain_mm_hr=rain_mm_hr,
    )
    quantiles = await asyncio.to_thread(QuantileMLEngine.predict, feat, sched_arr_epoch)

    # Format HH:MM in IST
    ist = ZoneInfo("Asia/Kolkata")
    def _fmt(epoch: int) -> str:
        return datetime.fromtimestamp(epoch, tz=timezone.utc).astimezone(ist).strftime("%H:%M")

    naive_ntes_epoch = sched_arr_epoch + int(target_train.current_delay_mins * 60)
    naive_ntes_eta_str = _fmt(naive_ntes_epoch)

    quantiles_dict = {
        "p10_safe_report": _fmt(quantiles.p10_eta_epoch),
        "p50_expected": _fmt(quantiles.p50_eta_epoch),
        "p90_worst_case": _fmt(quantiles.p90_eta_epoch),
    }

    # 5. Overtake alerts
    overtake_alerts = []
    for card in sim_result.causal_cards:
        if card.event in ("PRIORITY_OVERTAKE_HOLD", "CASCADE_DOUBLE_OVERTAKE"):
            overtake_alerts.append({
                "overtaking_train": card.caused_by_train or "Priority Express",
                "overtake_station": f"{card.station_code} ({card.station_name})",
                "projected_loop_hold_mins": int(card.added_delay_mins),
                "reason": card.human_message,
            })

    # 6. Freight shadow
    freight_shadow_dict = {
        "block": active_freight_shadow.get("block_id", "DN_CTC_BRAG") if active_freight_shadow else "NONE",
        "fsi_score": active_freight_shadow.get("str_value", 1.85) if active_freight_shadow else 1.0,
        "penalty_mins": int(freight_penalties.get("DN_CTC_BRAG", 20.0)),
    }

    # 7. Connection audit & rescue
    connection_audit = {
        "survival_probability_pct": 100.0,
        "status": "SAFE",
        "bailout_recommendation": None,
    }

    if request.connection_target:
        # Parse HH:MM into today's epoch in IST
        parts = request.connection_target.deadline_time.split(":")
        hh, mm = int(parts[0]), int(parts[1])
        ref_dt = datetime.fromtimestamp(current_epoch, tz=timezone.utc).astimezone(ist)
        target_deadline_dt = ref_dt.replace(hour=hh, minute=mm, second=0, microsecond=0)
        target_deadline_epoch = int(target_deadline_dt.timestamp())
        if target_deadline_epoch <= current_epoch:
            target_deadline_epoch += 86400


        rescue_eval = await asyncio.to_thread(
            evaluate_connection_rescue,
            train_state=target_train,
            destination_code=request.connection_target.station_code,
            connection_deadline_epoch=target_deadline_epoch,
            transfer_buffer_mins=request.connection_target.transfer_buffer_mins,
            passenger_status=request.passenger_status,
            sim_result=sim_result,
            topology=topology,
            current_epoch=current_epoch,
        )

        bailout_rec = None
        if rescue_eval.get("bailout_recommended") and rescue_eval.get("bailout_plan"):
            plan = rescue_eval["bailout_plan"]
            bailout_rec = {
                "deboard_at": f"{plan['deboard_station_code']} ({plan['deboard_station_name']})",
                "deboard_eta_p50": _fmt(plan["deboard_eta_epoch"]),
                "road_mode": plan["road_mode"],
                "road_duration_mins": int(plan["road_drive_mins"]),
                "final_arrival_eta": f"{_fmt(plan['final_road_arrival_epoch'])} (Saves {plan['minutes_saved']:.0f} mins vs staying on train)",
            }

        connection_audit = {
            "survival_probability_pct": rescue_eval.get("survival_probability_pct", 100.0),
            "status": rescue_eval.get("risk_level", "SAFE"),
            "safe_boarding_lock": rescue_eval.get("safe_boarding_lock", False),
            "bailout_recommendation": bailout_rec,
        }

    return PredictCascadeResponse(
        train_number=train_no,
        train_name=target_train.train_name,
        naive_ntes_eta=naive_ntes_eta_str,
        quantiles_target=quantiles_dict,
        overtake_alerts=overtake_alerts,
        freight_shadow=freight_shadow_dict,
        connection_audit=connection_audit,
    )

