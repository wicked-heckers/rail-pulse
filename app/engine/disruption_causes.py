from typing import TypedDict

from app.models.schemas import CausalCard


class CauseSpec(TypedDict):
    id: str
    label: str
    added_delay_mins: float
    freight_penalty_mins: float
    rain_mm_hr: float
    event: str
    station_code: str
    station_name: str
    message: str


DISRUPTION_CAUSE_CATALOG: dict[str, CauseSpec] = {
    "FREIGHT_BLOCKADE": {
        "id": "FREIGHT_BLOCKADE",
        "label": "Goods / Coal Rake Ahead (Block Drag)",
        "added_delay_mins": 0.0,
        "freight_penalty_mins": 20.0,
        "rain_mm_hr": 0.0,
        "event": "FREIGHT_SHADOW_DRAG",
        "station_code": "BRAG",
        "station_name": "Barang / Mainline Corridor",
        "message": "Slow goods/coal rake occupying mainline block ahead (+20 min block drag).",
    },
    "MONSOON_RAIN": {
        "id": "MONSOON_RAIN",
        "label": "Heavy Monsoon Rain (28 mm/hr)",
        "added_delay_mins": 8.0,
        "freight_penalty_mins": 0.0,
        "rain_mm_hr": 28.0,
        "event": "MONSOON_WEATHER_DRAG",
        "station_code": "CTC",
        "station_name": "ECoR Coastal Section",
        "message": "Heavy monsoon rainfall (28 mm/hr) causing wet-rail braking caution (+8 min + 25% slack loss).",
    },
    "TSR_MAINTENANCE": {
        "id": "TSR_MAINTENANCE",
        "label": "Track Maintenance / 30 km/h TSR",
        "added_delay_mins": 14.0,
        "freight_penalty_mins": 0.0,
        "rain_mm_hr": 0.0,
        "event": "STATIC_TSR_CAUTION",
        "station_code": "NRG",
        "station_name": "Nergundi-Barang Block",
        "message": "Temporary 30 km/h engineering speed restriction across track section (+14 min).",
    },
    "SIGNAL_CONGESTION": {
        "id": "SIGNAL_CONGESTION",
        "label": "Slow Preceding Train / Double-Yellow Signals",
        "added_delay_mins": 12.0,
        "freight_penalty_mins": 0.0,
        "rain_mm_hr": 0.0,
        "event": "COACHING_CONGESTION",
        "station_code": "CTC",
        "station_name": "Cuttack Approach",
        "message": "Crawling behind slower preceding train on restrictive signal aspects (+12 min).",
    },
    "PLATFORM_HOLD": {
        "id": "PLATFORM_HOLD",
        "label": "Terminal Platform / Yard Throat Hold",
        "added_delay_mins": 10.0,
        "freight_penalty_mins": 0.0,
        "rain_mm_hr": 0.0,
        "event": "JUNCTION_THROAT_HOLD",
        "station_code": "BBS",
        "station_name": "Bhubaneswar Yard Throat",
        "message": "Arrival platform occupied by delayed rake at junction throat (+10 min).",
    },
    "KUR_BRANCH_HOLD": {
        "id": "KUR_BRANCH_HOLD",
        "label": "Khurda Road Branch Throat Hold",
        "added_delay_mins": 15.0,
        "freight_penalty_mins": 0.0,
        "rain_mm_hr": 0.0,
        "event": "JUNCTION_THROAT_HOLD",
        "station_code": "KUR",
        "station_name": "Khurda Road Junction",
        "message": "Puri branch single-line throat occupied by delayed rake; holding at Khurda Road Junction Loop (+15 min).",
    },
    "SRC_BRANCH_HOLD": {
        "id": "SRC_BRANCH_HOLD",
        "label": "Santragachi Junction Yard Throat Hold",
        "added_delay_mins": 15.0,
        "freight_penalty_mins": 0.0,
        "rain_mm_hr": 0.0,
        "event": "JUNCTION_THROAT_HOLD",
        "station_code": "SRC",
        "station_name": "Santragachi Junction",
        "message": "South Eastern trunk junction throat occupied by freight rake; holding at Santragachi Junction Loop (+15 min).",
    },
    "OHE_BRAKE_FAULT": {
        "id": "OHE_BRAKE_FAULT",
        "label": "OHE Traction Trip / Brake-Binding",
        "added_delay_mins": 25.0,
        "freight_penalty_mins": 0.0,
        "rain_mm_hr": 0.0,
        "event": "OHE_OR_BRAKE_FAULT",
        "station_code": "JKPR",
        "station_name": "Jakhapura-Cuttack Section",
        "message": "OHE traction trip or rolling-stock brake-binding clearance ahead (+25 min).",
    },
}


def compute_causes_impact(causes: list[str]) -> tuple[float, float, float]:
    """Returns (total_direct_delay_mins, freight_penalty_mins, max_rain_mm_hr) for unique causes."""
    unique_causes = list(dict.fromkeys(c for c in causes if c in DISRUPTION_CAUSE_CATALOG))
    direct_delay = sum(DISRUPTION_CAUSE_CATALOG[c]["added_delay_mins"] for c in unique_causes)
    freight_penalty = max(
        (DISRUPTION_CAUSE_CATALOG[c]["freight_penalty_mins"] for c in unique_causes),
        default=0.0,
    )
    rain_mm = max(
        (DISRUPTION_CAUSE_CATALOG[c]["rain_mm_hr"] for c in unique_causes),
        default=0.0,
    )
    return direct_delay, freight_penalty, rain_mm


def build_cause_cards(causes: list[str], direction: str) -> list[CausalCard]:
    """Builds CausalCards for active non-freight causes on a train."""
    from app.core.database import LocalTopologyFallback
    active_cid = LocalTopologyFallback.get_active_corridor_id()
    is_kolkata = active_cid == "SER_HWH_KGP"

    cards: list[CausalCard] = []
    for cause_id in dict.fromkeys(causes):
        spec = DISRUPTION_CAUSE_CATALOG.get(cause_id)
        if not spec or spec["added_delay_mins"] <= 0:
            continue

        if is_kolkata:
            if cause_id == "PLATFORM_HOLD":
                stn_code = "HWH" if direction == "UP" else "KGP"
                stn_name = "Howrah Terminal Throat" if direction == "UP" else "Kharagpur Yard Throat"
            elif cause_id in ("KUR_BRANCH_HOLD", "SRC_BRANCH_HOLD"):
                stn_code = "SRC"
                stn_name = "Santragachi Junction"
            elif cause_id == "MONSOON_RAIN":
                stn_code = "MCA"
                stn_name = "SER Gangetic Section"
            elif cause_id == "TSR_MAINTENANCE":
                stn_code = "ULB"
                stn_name = "Uluberia-Bagnan Block"
            elif cause_id == "SIGNAL_CONGESTION":
                stn_code = "SRC"
                stn_name = "Santragachi Approach"
            elif cause_id == "OHE_BRAKE_FAULT":
                stn_code = "MCA"
                stn_name = "Mecheda-Panskura Section"
            else:
                stn_code = spec["station_code"]
                stn_name = spec["station_name"]
        else:
            stn_code = "BBS" if (direction == "UP" and cause_id == "PLATFORM_HOLD") else spec["station_code"]
            stn_name = spec["station_name"]

        cards.append(
            CausalCard(
                event=spec["event"],
                station_code=stn_code,
                station_name=stn_name,
                added_delay_mins=spec["added_delay_mins"],
                human_message=spec["message"],
            )
        )
    return cards
