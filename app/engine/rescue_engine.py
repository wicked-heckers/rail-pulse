from datetime import datetime, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

import httpx

from app.config import settings
from app.core.database import LocalRoadMatrixFallback
from app.engine.quantile_ml import QuantileMLEngine, calculate_connection_survival
from app.models.schemas import QuantileFeatureVector, SimulationResult, TrainKinematicState


async def fetch_osrm_drive_time(
    from_coords: tuple[float, float],
    to_coords: tuple[float, float],
    timeout: float = 2.0,
) -> tuple[float, float, str] | None:
    """
    Queries live OSRM routing API with strict timeout.
    Returns (distance_km, duration_mins, polyline) or None on failure.
    """
    url = f"{settings.OSRM_BASE_URL}/{from_coords[1]},{from_coords[0]};{to_coords[1]},{to_coords[0]}?overview=full"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("routes"):
                    route = data["routes"][0]
                    dist_km = round(route["distance"] / 1000.0, 1)
                    duration_mins = round(route["duration"] / 60.0, 1)
                    polyline = route.get("geometry", "")
                    return dist_km, duration_mins, polyline
    except Exception:
        pass
    return None


def evaluate_connection_rescue(
    train_state: TrainKinematicState,
    destination_code: str,
    connection_deadline_epoch: int,
    transfer_buffer_mins: int = 15,
    passenger_status: Literal["PRE_BOARDING", "ON_BOARD"] = "ON_BOARD",
    sim_result: SimulationResult | None = None,
    topology: dict[str, Any] | None = None,
    current_epoch: int = 1795070000,
) -> dict[str, Any]:
    """
    Evaluates connection survival and early-junction road bailout options.
    Enforces the Safe-Boarding Guardrail and commercial halt eligibility.
    """
    stations_map = {s["station_code"]: s for s in (topology["stations"] if topology else [])}
    cutoff_epoch = connection_deadline_epoch - (transfer_buffer_mins * 60)

    # 1. Evaluate Train Arrival at Final Destination
    dest_arrival = None
    if sim_result:
        dest_arrival = next((a for a in sim_result.timeline if a.station_code == destination_code), None)

    sched_arr = dest_arrival.sched_arr_epoch if dest_arrival else (current_epoch + 3600)
    p50_base = dest_arrival.net_delay_mins if dest_arrival else train_state.current_delay_mins

    # Predict quantiles using ML engine
    feat = QuantileFeatureVector(
        current_delay_mins=train_state.current_delay_mins,
        p50_base_delay_mins=p50_base,
        remaining_km=max(10.0, abs((stations_map[destination_code]["chainage_km"] if destination_code in stations_map else 143.0) - train_state.chainage_km)),
    )
    quantiles = QuantileMLEngine.predict(feat, sched_arr)

    # Calculate survival probability
    survival_prob = calculate_connection_survival(
        cutoff_epoch=cutoff_epoch,
        p10_epoch=quantiles.p10_eta_epoch,
        p50_epoch=quantiles.p50_eta_epoch,
        p90_epoch=quantiles.p90_eta_epoch,
        sched_arr_epoch=sched_arr,
    )
    survival_pct = round(survival_prob * 100.0, 1)

    risk_level = (
        "SAFE" if survival_prob >= 0.70
        else "WATCH" if survival_prob >= 0.40
        else "HIGH_RISK_MISS"
    )

    # 2. Safe-Boarding Guardrail (Pre-Boarding Lock)
    if passenger_status == "PRE_BOARDING":
        return {
            "passenger_status": "PRE_BOARDING",
            "survival_probability_pct": survival_pct,
            "risk_level": risk_level,
            "safe_boarding_lock": True,
            "boarding_advisory": "Report to your boarding station as per official schedule. Delayed trains can recover slack or be rescheduled.",
            "bailout_recommended": False,
            "quantiles": quantiles.model_dump(),
        }

    # 3. Early-Junction Rescue Search (Triggers strictly when survival < 40%)
    bailout_plan = None
    if survival_prob < settings.BAILOUT_TRIGGER_SURVIVAL_THRESHOLD and sim_result and topology:
        # Check current hour in IST for peak traffic multiplier
        ist_now = datetime.fromtimestamp(current_epoch, tz=timezone.utc).astimezone(ZoneInfo("Asia/Kolkata"))
        is_peak_hour = (8 <= ist_now.hour <= 11) or (17 <= ist_now.hour <= 20)
        traffic_factor = settings.PEAK_HOUR_TRAFFIC_MULTIPLIER if is_peak_hour else 1.0

        for arrival in sim_result.timeline:
            stn_code = arrival.station_code
            if stn_code == destination_code:
                break  # Rescue must occur before final destination

            stn_info = stations_map.get(stn_code, {})
            is_comm = arrival.is_commercial_halt
            is_junction = stn_info.get("is_major_junction", False)

            # Allow deboarding if train is currently at station, or arriving in >= 5 minutes
            is_currently_at_station = (
                train_state.current_station == stn_code and train_state.speed_kmph <= 5.0
            )
            reaction_time_secs = arrival.projected_arr_epoch - current_epoch
            sufficient_reaction = (reaction_time_secs >= 300) or is_currently_at_station

            # Eligibility filters: commercial halt + major junction + sufficient reaction time
            if is_comm and is_junction and sufficient_reaction:
                # Lookup road travel time
                road_data = LocalRoadMatrixFallback.get_route(stn_code, destination_code)
                if not road_data:
                    continue

                exit_penalty_mins = float(road_data.get("station_exit_penalty_mins", 12.0))
                base_drive_mins = float(road_data.get("base_drive_mins", 35.0))
                effective_drive_mins = base_drive_mins * traffic_factor
                total_road_transit_mins = exit_penalty_mins + effective_drive_mins

                road_arrival_epoch = arrival.projected_arr_epoch + int(total_road_transit_mins * 60)
                minutes_saved = round((quantiles.p50_eta_epoch - road_arrival_epoch) / 60.0, 1)

                # Road hop must arrive before cutoff and save >= 10 mins vs train
                if road_arrival_epoch <= cutoff_epoch and minutes_saved >= settings.MIN_TIME_SAVED_THRESHOLD_MINS:
                    # Compute road survival
                    road_survival = 0.88 if road_arrival_epoch <= (cutoff_epoch - 600) else 0.72

                    bailout_plan = {
                        "deboard_station_code": stn_code,
                        "deboard_station_name": arrival.station_name,
                        "deboard_eta_epoch": arrival.projected_arr_epoch,
                        "road_mode": road_data.get("highway_name", "NH Expressway Cab"),
                        "station_exit_mins": exit_penalty_mins,
                        "road_drive_mins": round(effective_drive_mins, 1),
                        "final_road_arrival_epoch": road_arrival_epoch,
                        "minutes_saved": minutes_saved,
                        "road_survival_pct": round(road_survival * 100.0, 1),
                        "polyline": road_data.get("polyline", ""),
                        "human_guidance": (
                            f"Deboard at {arrival.station_name} + take {road_data.get('highway_name')} "
                            f"to reach {stations_map.get(destination_code, {}).get('station_name', destination_code)} "
                            f"saving {minutes_saved:.0f} mins (Road arrival beats train P50)."
                        ),
                    }
                    break

    return {
        "passenger_status": passenger_status,
        "survival_probability_pct": survival_pct,
        "risk_level": risk_level,
        "safe_boarding_lock": False,
        "train_p10_eta_epoch": quantiles.p10_eta_epoch,
        "train_p50_eta_epoch": quantiles.p50_eta_epoch,
        "train_p90_eta_epoch": quantiles.p90_eta_epoch,
        "bailout_recommended": (bailout_plan is not None),
        "bailout_plan": bailout_plan,
        "disclaimer": "Deboarding remains passenger's voluntary operational decision subject to railway ticketing and safety regulations.",
    }
