import math
from typing import Any

from app.models.schemas import HeadwayInfo, TrainKinematicState


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two GPS coordinates in kilometers."""
    r = 6371.0  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def project_lat_lon_to_chainage(
    lat: float, lon: float, stations: list[dict[str, Any]]
) -> float:
    """
    Projects a GPS coordinate (lat, lon) onto the 1D linear chainage axis.
    Finds the closest station segment and interpolates along the track vector.
    """
    if not stations:
        return 0.0

    sorted_stns = sorted(stations, key=lambda s: s["chainage_km"])
    if len(sorted_stns) == 1:
        return float(sorted_stns[0]["chainage_km"])

    # Find closest station
    closest_idx = 0
    min_dist = float("inf")
    for idx, stn in enumerate(sorted_stns):
        dist = haversine_distance_km(lat, lon, stn["lat"], stn["lon"])
        if dist < min_dist:
            min_dist = dist
            closest_idx = idx

    # If within 500m of the station, snap directly
    if min_dist < 0.5:
        return float(sorted_stns[closest_idx]["chainage_km"])

    # Interpolate between closest station and its neighbors
    best_chainage = float(sorted_stns[closest_idx]["chainage_km"])
    candidates = []
    if closest_idx > 0:
        candidates.append((sorted_stns[closest_idx - 1], sorted_stns[closest_idx]))
    if closest_idx < len(sorted_stns) - 1:
        candidates.append((sorted_stns[closest_idx], sorted_stns[closest_idx + 1]))

    min_proj_error = float("inf")
    for stn_a, stn_b in candidates:
        d_ab = haversine_distance_km(stn_a["lat"], stn_a["lon"], stn_b["lat"], stn_b["lon"])
        if d_ab == 0.0:
            continue
        d_ap = haversine_distance_km(stn_a["lat"], stn_a["lon"], lat, lon)
        d_bp = haversine_distance_km(stn_b["lat"], stn_b["lon"], lat, lon)

        # Projection ratio along segment A -> B using law of cosines
        ratio = max(0.0, min(1.0, (d_ap**2 + d_ab**2 - d_bp**2) / (2.0 * d_ab**2)))
        proj_error = abs(d_ap**2 - (ratio * d_ab) ** 2)

        if proj_error < min_proj_error:
            min_proj_error = proj_error
            chainage_span = stn_b["chainage_km"] - stn_a["chainage_km"]
            best_chainage = stn_a["chainage_km"] + (ratio * chainage_span)

    return round(best_chainage, 2)


def chainage_to_lat_lon(
    chainage_km: float, stations: list[dict[str, Any]]
) -> tuple[float, float]:
    """
    Interpolates a GPS (lat, lon) coordinate from a given 1D chainage kilometer.
    """
    sorted_stns = sorted(stations, key=lambda s: s["chainage_km"])
    if chainage_km <= sorted_stns[0]["chainage_km"]:
        return sorted_stns[0]["lat"], sorted_stns[0]["lon"]
    if chainage_km >= sorted_stns[-1]["chainage_km"]:
        return sorted_stns[-1]["lat"], sorted_stns[-1]["lon"]

    for i in range(len(sorted_stns) - 1):
        s_curr = sorted_stns[i]
        s_next = sorted_stns[i + 1]
        if s_curr["chainage_km"] <= chainage_km <= s_next["chainage_km"]:
            span = s_next["chainage_km"] - s_curr["chainage_km"]
            if span == 0:
                return s_curr["lat"], s_curr["lon"]
            ratio = (chainage_km - s_curr["chainage_km"]) / span
            lat = s_curr["lat"] + ratio * (s_next["lat"] - s_curr["lat"])
            lon = s_curr["lon"] + ratio * (s_next["lon"] - s_curr["lon"])
            return round(lat, 5), round(lon, 5)

    return sorted_stns[-1]["lat"], sorted_stns[-1]["lon"]


def separate_dwell_from_run(
    arr_prev_epoch: int,
    dep_prev_epoch: int,
    arr_next_epoch: int,
    sched_dwell_mins: int = 2,
) -> dict[str, float]:
    """
    Isolates pure block running minutes from station halt dwell time.
    Prevents a 20-min station watering/crew change halt from falsely inflating STR.
    """
    actual_dwell_mins = max(0.0, (dep_prev_epoch - arr_prev_epoch) / 60.0)
    actual_block_run_mins = max(0.0, (arr_next_epoch - dep_prev_epoch) / 60.0)
    excess_dwell_mins = max(0.0, actual_dwell_mins - sched_dwell_mins)

    return {
        "actual_block_run_mins": round(actual_block_run_mins, 2),
        "actual_dwell_mins": round(actual_dwell_mins, 2),
        "excess_dwell_mins": round(excess_dwell_mins, 2),
    }


def compute_headways(
    trains: list[TrainKinematicState], direction: str
) -> dict[str, HeadwayInfo]:
    """
    Computes preceding and trailing headway gaps for all active trains on a directional track.
    - For DN (Southbound, 0 -> 206 km): Leading train has HIGHER chainage.
    - For UP (Northbound, 206 -> 0 km): Leading train has LOWER chainage.
    """
    dir_trains = [t for t in trains if t.direction == direction]
    if not dir_trains:
        return {}

    # Sort so that index i is followed by train ahead at index i+1
    if direction == "DN":
        # Chainage increases towards destination. Leading train is ahead (larger km).
        sorted_trains = sorted(dir_trains, key=lambda t: t.chainage_km)
    else:
        # Chainage decreases towards destination. Leading train is ahead (smaller km).
        sorted_trains = sorted(dir_trains, key=lambda t: t.chainage_km, reverse=True)

    headways: dict[str, HeadwayInfo] = {}

    for i, train in enumerate(sorted_trains):
        info = HeadwayInfo(train_no=train.train_no, direction=train.direction)

        # Leading (preceding) train is at i+1
        if i + 1 < len(sorted_trains):
            lead = sorted_trains[i + 1]
            gap_km = abs(lead.chainage_km - train.chainage_km)
            speed = train.speed_kmph if train.speed_kmph > 10.0 else 60.0
            gap_mins = (gap_km / speed) * 60.0

            info.preceding_train_no = lead.train_no
            info.preceding_gap_km = round(gap_km, 2)
            info.preceding_gap_mins = round(gap_mins, 2)

        # Trailing (behind) train is at i-1
        if i > 0:
            trail = sorted_trains[i - 1]
            gap_km = abs(train.chainage_km - trail.chainage_km)
            speed = trail.speed_kmph if trail.speed_kmph > 10.0 else 60.0
            gap_mins = (gap_km / speed) * 60.0

            info.trailing_train_no = trail.train_no
            info.trailing_gap_km = round(gap_km, 2)
            info.trailing_gap_mins = round(gap_mins, 2)

        headways[train.train_no] = info

    return headways


def get_block_for_chainage(
    chainage_km: float, direction: str, track_blocks: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Finds the directional track block corresponding to a 1D chainage position."""
    for block in track_blocks:
        if block["direction"] != direction:
            continue
        start = min(block["start_km"], block["end_km"])
        end = max(block["start_km"], block["end_km"])
        if start <= chainage_km <= end:
            return block
    return None
