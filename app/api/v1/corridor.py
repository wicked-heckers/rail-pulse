from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import CorridorStateStore, get_state_store, get_topology

router = APIRouter(tags=["Corridor"])


@router.get("/topology")
async def get_corridor_topology(
    topology: dict[str, Any] = Depends(get_topology),
) -> dict[str, Any]:
    """
    Returns full GeoJSON FeatureCollection of the ECoR trunk corridor:
    station points, track block linestrings, loops, and freight merge chords.
    """
    stations = topology.get("stations", [])
    track_blocks = topology.get("track_blocks", [])

    stn_coord_map = {s["station_code"]: (s["lon"], s["lat"]) for s in stations}

    features: list[dict[str, Any]] = []

    # 1. Station Point Features
    for stn in stations:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [stn["lon"], stn["lat"]],
            },
            "properties": {
                "feature_type": "STATION",
                "station_code": stn["station_code"],
                "station_name": stn["station_name"],
                "chainage_km": stn["chainage_km"],
                "has_750m_goods_loop": stn.get("has_750m_goods_loop", False),
                "is_major_junction": stn.get("is_major_junction", False),
                "passenger_loops_dn": stn.get("passenger_loops_dn", 1),
                "passenger_loops_up": stn.get("passenger_loops_up", 1),
                "road_exit_penalty_m": stn.get("road_exit_penalty_m", 12),
            },
        })

    # 2. Track Block LineString Features
    for block in track_blocks:
        from_stn = block.get("from_station")
        to_stn = block.get("to_station")
        from_coord = stn_coord_map.get(from_stn)
        to_coord = stn_coord_map.get(to_stn)

        if from_coord and to_coord:
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [from_coord, to_coord],
                },
                "properties": {
                    "feature_type": "TRACK_BLOCK",
                    "block_id": block["block_id"],
                    "direction": block["direction"],
                    "from_station": from_stn,
                    "to_station": to_stn,
                    "start_km": block["start_km"],
                    "end_km": block["end_km"],
                    "length_km": block["length_km"],
                    "mps_kmph": block.get("mps_kmph", 110),
                    "free_flow_mins": block["free_flow_mins"],
                    "terminal_slack_mins": block.get("terminal_slack_mins", 0.0),
                    "freight_injection_weight": block.get("freight_injection_weight", 0.15),
                },
            })

    # 3. Dedicated Barang Goods Merge Chord Feature
    features.append({
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": [[85.78, 20.44], [85.83, 20.4024]],  # Talcher branch -> Barang Goods Loop
        },
        "properties": {
            "feature_type": "FREIGHT_MERGE_CHORD",
            "name": "Barang Freight Inflow Chord",
            "source": "TALCHER_COAL_BELT",
            "merge_station": "BRAG",
            "merge_km": 128.0,
            "has_750m_goods_loop": True,
        },
    })

    return {
        "type": "FeatureCollection",
        "name": "ECoR_BHC_PURI_Corridor",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }


@router.get("/config")
async def get_corridor_client_config() -> dict[str, Any]:
    """
    Returns public frontend configuration including Mapbox token.
    """
    from app.config import settings
    return {
        "mapbox_access_token": settings.MAPBOX_ACCESS_TOKEN,
        "corridor_name": settings.CORRIDOR_NAME,
        "corridor_start_km": settings.CORRIDOR_START_KM,
        "corridor_end_km": settings.CORRIDOR_END_KM,
    }


@router.get("/state")
async def get_corridor_state(
    state_store: CorridorStateStore = Depends(get_state_store),
) -> dict[str, Any]:
    """
    Returns current sub-second snapshot of all trains, phantom freight shadows,
    and weather conditions on the corridor.
    """
    return await state_store.get_snapshot()
