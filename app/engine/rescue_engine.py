import logging
import time
from datetime import UTC, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

import httpx

from app.config import settings
from app.core.database import LocalRoadMatrixFallback
from app.engine.quantile_ml import (
    QuantileMLEngine,
    build_quantile_feature_vector,
    calculate_connection_survival,
)
from app.engine.slack_adjuster import apply_slack_to_timeline
from app.models.schemas import (
    SimulationResult,
    StationArrival,
    TrainKinematicState,
)

logger = logging.getLogger("railpulse.rescue")

_MAPBOX_CACHE: dict[str, tuple[float, float, str, float]] = {}


def get_mapbox_road_route_sync(
    from_code: str,
    to_code: str,
    from_coords: tuple[float, float],
    to_coords: tuple[float, float],
    timeout: float = 2.0,
) -> dict[str, Any] | None:
    """
    Queries live Mapbox Directions API with in-memory caching and strict timeout.
    Returns dynamic drive metrics or None on failure/missing token.
    """
    token = settings.MAPBOX_ACCESS_TOKEN
    if not token:
        return None

    cache_key = f"{from_code}_{to_code}"
    now = time.time()
    if cache_key in _MAPBOX_CACHE:
        dist_km, dur_mins, polyline, exp = _MAPBOX_CACHE[cache_key]
        if now < exp:
            return {
                "distance_km": dist_km,
                "base_drive_mins": dur_mins,
                "polyline": polyline,
                "highway_name": "NH-16 Expressway (Live Mapbox Traffic)",
                "provider": "MAPBOX_LIVE",
            }

    # Mapbox coordinate format: longitude,latitude
    url = (
        f"{settings.MAPBOX_DIRECTIONS_BASE_URL}/"
        f"{from_coords[1]},{from_coords[0]};{to_coords[1]},{to_coords[0]}"
        f"?overview=simplified&access_token={token}"
    )
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("routes"):
                    route = data["routes"][0]
                    dist_km = round(route["distance"] / 1000.0, 1)
                    dur_mins = round(route["duration"] / 60.0, 1)
                    polyline = route.get("geometry", "")
                    _MAPBOX_CACHE[cache_key] = (dist_km, dur_mins, polyline, now + 300.0)
                    return {
                        "distance_km": dist_km,
                        "base_drive_mins": dur_mins,
                        "polyline": polyline,
                        "highway_name": "NH-16 Expressway (Live Mapbox Traffic)",
                        "provider": "MAPBOX_LIVE",
                    }
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.debug("Mapbox live route query bypassed: %s", exc)
    return None


def get_osrm_road_route_sync(
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
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("routes"):
                    route = data["routes"][0]
                    dist_km = round(route["distance"] / 1000.0, 1)
                    duration_mins = round(route["duration"] / 60.0, 1)
                    polyline = route.get("geometry", "")
                    return dist_km, duration_mins, polyline
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.debug("OSRM route query bypassed: %s", exc)
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
    use_live_traffic: bool = False,
    rain_mm_hr: float = 0.0,
    freight_shadow_prob: float = 0.0,
    adjusted_timeline: list[StationArrival] | None = None,
) -> dict[str, Any]:
    """
    Evaluates connection survival and early-junction road bailout options.
    Enforces the Safe-Boarding Guardrail and commercial halt eligibility.
    """
    stations_map = {s["station_code"]: s for s in (topology["stations"] if topology else [])}
    cutoff_epoch = connection_deadline_epoch - (transfer_buffer_mins * 60)

    # Apply timetable recovery slack if caller passed raw simulation output
    timeline: list[StationArrival] = list(adjusted_timeline) if adjusted_timeline is not None else []
    if not timeline and sim_result:
        if topology and topology.get("track_blocks"):
            timeline = apply_slack_to_timeline(
                timeline=sim_result.timeline,
                track_blocks=topology.get("track_blocks", []),
                direction=train_state.direction,
                rain_mm_hr=rain_mm_hr,
                freight_probability=freight_shadow_prob,
            )
        else:
            timeline = list(sim_result.timeline)

    # 1. Evaluate Train Arrival at Final Destination
    dest_arrival = next((a for a in timeline if a.station_code == destination_code), None)
    corridor_stations = topology.get("stations", []) if topology else []
    fallback_km = float(corridor_stations[-1]["chainage_km"]) if corridor_stations else 143.0
    dest_km = stations_map[destination_code]["chainage_km"] if destination_code in stations_map else fallback_km
    already_reached = (
        (train_state.direction == "DN" and train_state.chainage_km >= dest_km - 0.5)
        or (train_state.direction == "UP" and train_state.chainage_km <= dest_km + 0.5)
    )

    if dest_arrival is not None:
        sched_arr = dest_arrival.sched_arr_epoch
        remaining_km = max(0.0 if already_reached else 1.0, abs(dest_km - train_state.chainage_km))
    elif already_reached:
        past_km = abs(train_state.chainage_km - dest_km)
        cruise_spd = 130.0 if train_state.priority_rank == 1 else 110.0
        elapsed_past_secs = int((past_km / cruise_spd) * 3600) if past_km > 0.5 else 0
        proj_dest_epoch = current_epoch - elapsed_past_secs
        sched_arr = proj_dest_epoch - int(train_state.current_delay_mins * 60)
        remaining_km = 0.0
    else:
        sched_arr = current_epoch + 3600
        remaining_km = max(10.0, abs(dest_km - train_state.chainage_km))

    # Predict quantiles using unified 12-feature ML vector
    feat = build_quantile_feature_vector(
        train_state=train_state,
        sim_result=sim_result,
        adjusted_timeline=timeline,
        target_arrival=dest_arrival,
        remaining_km=remaining_km,
        freight_shadow_prob=freight_shadow_prob,
        rain_mm_hr=rain_mm_hr,
        current_epoch=current_epoch,
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
        ist_now = datetime.fromtimestamp(current_epoch, tz=UTC).astimezone(ZoneInfo("Asia/Kolkata"))
        is_peak_hour = (8 <= ist_now.hour <= 11) or (17 <= ist_now.hour <= 20)
        traffic_factor = settings.PEAK_HOUR_TRAFFIC_MULTIPLIER if is_peak_hour else 1.0

        for arrival in timeline:
            stn_code = arrival.station_code
            if stn_code == destination_code:
                break  # Rescue must occur before final destination

            stn_info = stations_map.get(stn_code, {})
            is_comm = arrival.is_commercial_halt
            is_junction = stn_info.get("is_major_junction", False)

            # Allow deboarding if train is currently at station, or arriving in >= 5 minutes
            stn_km = float(stn_info.get("chainage_km", -999.0))
            is_currently_at_station = (
                (train_state.current_station == stn_code or abs(train_state.chainage_km - stn_km) <= 0.5)
                and (train_state.speed_kmph is None or train_state.speed_kmph <= 15.0)
            )
            reaction_time_secs = arrival.projected_arr_epoch - current_epoch
            sufficient_reaction = (reaction_time_secs >= 300) or is_currently_at_station

            # Eligibility filters: commercial halt + major junction + sufficient reaction time
            if is_comm and is_junction and sufficient_reaction:
                # Lookup road travel time
                road_data = LocalRoadMatrixFallback.get_route(stn_code, destination_code)
                if use_live_traffic:
                    dest_info = stations_map.get(destination_code, {})
                    stn_lat, stn_lon = stn_info.get("lat"), stn_info.get("lon")
                    dest_lat, dest_lon = dest_info.get("lat"), dest_info.get("lon")
                    if stn_lat and stn_lon and dest_lat and dest_lon:
                        # Tier 1: Try Mapbox if access token is present
                        if settings.MAPBOX_ACCESS_TOKEN:
                            mapbox_res = get_mapbox_road_route_sync(
                                stn_code, destination_code, (stn_lat, stn_lon), (dest_lat, dest_lon)
                            )
                            if mapbox_res:
                                road_data = {**(road_data or {}), **mapbox_res}

                        # Tier 2: Try public OSRM router if Mapbox was bypassed or failed
                        if not road_data or road_data.get("provider") != "MAPBOX_LIVE":
                            osrm_res = get_osrm_road_route_sync((stn_lat, stn_lon), (dest_lat, dest_lon))
                            if osrm_res:
                                dist_km, dur_mins, polyline = osrm_res
                                road_data = {
                                    **(road_data or {}),
                                    "distance_km": dist_km,
                                    "base_drive_mins": dur_mins,
                                    "polyline": polyline,
                                    "highway_name": "NH-16 Expressway (Live OSRM Routing)",
                                    "provider": "OSRM_LIVE",
                                }

                if not road_data:
                    continue

                exit_penalty_mins = float(road_data.get("station_exit_penalty_mins", 12.0))
                base_drive_mins = float(road_data.get("base_drive_mins", 35.0))
                effective_drive_mins = base_drive_mins * traffic_factor
                total_road_transit_mins = exit_penalty_mins + effective_drive_mins

                deboard_epoch = max(current_epoch, arrival.projected_arr_epoch)
                road_arrival_epoch = deboard_epoch + int(total_road_transit_mins * 60)
                minutes_saved = round((quantiles.p50_eta_epoch - road_arrival_epoch) / 60.0, 1)

                # Road hop must arrive before cutoff and save >= 10 mins vs train
                if road_arrival_epoch <= cutoff_epoch and minutes_saved >= settings.MIN_TIME_SAVED_THRESHOLD_MINS:
                    # Compute road survival
                    road_survival = 0.88 if road_arrival_epoch <= (cutoff_epoch - 600) else 0.72
                    dest_info = stations_map.get(destination_code, {})

                    bailout_plan = {
                        "deboard_station_code": stn_code,
                        "deboard_station_name": arrival.station_name,
                        "deboard_eta_epoch": deboard_epoch,
                        "destination_station_code": destination_code,
                        "destination_station_name": dest_info.get("station_name", destination_code),
                        "road_distance_km": float(road_data.get("distance_km", 27.4)),
                        "highway_name": road_data.get("highway_name", "NH-16 Expressway"),
                        "road_mode": road_data.get("highway_name", "NH Expressway Cab"),
                        "station_exit_mins": exit_penalty_mins,
                        "road_drive_mins": round(effective_drive_mins, 1),
                        "final_road_arrival_epoch": road_arrival_epoch,
                        "minutes_saved": minutes_saved,
                        "road_survival_pct": round(road_survival * 100.0, 1),
                        "polyline": road_data.get("polyline", ""),
                        "human_guidance": (
                            f"Deboard at {arrival.station_name} + take {road_data.get('highway_name')} "
                            f"to reach {dest_info.get('station_name', destination_code)} "
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
