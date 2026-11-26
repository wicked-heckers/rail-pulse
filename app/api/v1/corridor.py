from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import CorridorStateStore, demo_provider, get_state_store
from app.core.database import LocalTopologyFallback
from app.models.schemas import CorridorSwitchRequest

router = APIRouter(tags=["Corridor"])


@router.get("/list")
async def list_available_corridors() -> list[dict[str, Any]]:
    """
    Returns list of all available railway corridors configured in the system,
    with active status, section coverage, length, and primary highway.
    """
    return LocalTopologyFallback.list_corridors()


@router.get("/topology")
async def get_corridor_topology(
    corridor_id: str | None = Query(None, description="Optional corridor ID (e.g. ECoR_BHC_PURI, SER_HWH_KGP)"),
) -> dict[str, Any]:
    """
    Returns full GeoJSON FeatureCollection of the requested or active trunk corridor:
    station points, track block linestrings, loops, and freight merge chords.
    """
    topology = LocalTopologyFallback.load_topology(corridor_id=corridor_id)
    stations = topology.get("stations", [])
    track_blocks = topology.get("track_blocks", [])
    active_cid = corridor_id or topology.get("corridor_id") or LocalTopologyFallback.get_active_corridor_id()

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

    # 3. Dedicated Freight Merge Chord Feature
    if active_cid == "SER_HWH_KGP" or any(s["station_code"] == "HWH" for s in stations):
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[88.06, 22.03], [87.86, 22.42]],  # Haldia Port Chord -> Mecheda Loop
            },
            "properties": {
                "feature_type": "FREIGHT_MERGE_CHORD",
                "name": "Haldia Port Freight Chord",
                "source": "HALDIA_PORT_DOCKS",
                "merge_station": "MCA",
                "merge_km": 58.0,
                "has_750m_goods_loop": True,
            },
        })
    else:
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
        "name": f"{active_cid}_Corridor",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }


@router.get("/config")
async def get_corridor_client_config() -> dict[str, Any]:
    """
    Returns public frontend configuration including Mapbox token and active corridor dimensions.
    """
    from app.config import settings
    active_cid = LocalTopologyFallback.get_active_corridor_id()
    topo = LocalTopologyFallback.load_topology(corridor_id=active_cid)
    stations = topo.get("stations", [])
    end_km = float(stations[-1]["chainage_km"]) if stations else settings.CORRIDOR_END_KM
    name = topo.get("corridor_name", settings.CORRIDOR_NAME)
    return {
        "active_corridor_id": active_cid,
        "mapbox_access_token": settings.MAPBOX_ACCESS_TOKEN,
        "corridor_name": name,
        "corridor_start_km": settings.CORRIDOR_START_KM,
        "corridor_end_km": end_km,
    }


@router.post("/switch")
async def switch_active_corridor(
    req: CorridorSwitchRequest,
    state_store: CorridorStateStore = Depends(get_state_store),
) -> dict[str, Any]:
    """
    Dynamically switches the active corridor across topology cache, state store,
    and demo simulation provider.
    """
    LocalTopologyFallback.set_active_corridor(req.corridor_id)
    await state_store.set_active_corridor(req.corridor_id)
    demo_provider.switch_corridor(req.corridor_id, speed_multiplier=float(req.speed_multiplier))
    new_snap = await demo_provider.tick()
    await state_store.update_trains(new_snap["trains"])
    await state_store.update_freight_shadows(new_snap["phantom_freights"])
    await state_store.update_weather(new_snap["weather"])
    return await state_store.get_snapshot()


@router.get("/state")
async def get_corridor_state(
    state_store: CorridorStateStore = Depends(get_state_store),
) -> dict[str, Any]:
    """
    Returns current sub-second snapshot of all trains, phantom freight shadows,
    and weather conditions on the corridor.
    """
    return await state_store.get_snapshot()
