import asyncio
import logging
from typing import Any

from app.core.database import LocalTopologyFallback
from app.engine.chainage_mapper import chainage_to_lat_lon
from app.ingestion.base import CorridorDataProvider
from app.models.schemas import FreightInferenceResult, TrainKinematicState

logger = logging.getLogger("railpulse.demo_provider")


class DemoSimulationProvider(CorridorDataProvider):
    """
    Deterministic ECoR corridor time-warped simulation engine.
    Produces the exact SIH26028 calibrated demonstration scenario on demand:
    - 12821 Dhauli Express: delayed 28 mins on DN line, approaching Cuttack/Barang.
    - 22895 Vande Bharat Express: closing at 130 km/h from behind.
    - 18410 Sri Jagannath Express: running normal on UP line.
    - Active coal freight shadow at Barang Junction (DN_CTC_BRAG).
    """

    def __init__(self, speed_multiplier: float = 1.0) -> None:
        self.speed_multiplier = speed_multiplier
        self.sim_clock_secs = 1795071480  # 10:58 AM IST
        self.topology = LocalTopologyFallback.load_topology()
        self.stations = self.topology["stations"]

        # Initial deterministic state
        self._trains: dict[str, dict[str, Any]] = {
            "12821": {
                "name": "Dhauli Express",
                "direction": "DN",
                "priority_rank": 2,
                "chainage_km": 115.0,  # At Cuttack Station
                "speed_kmph": 0.0,
                "delay_mins": 28.0,
                "status": "AT_STATION_HALT",
                "current_station": "CTC",
                "next_station": "BRAG",
            },
            "22895": {
                "name": "Howrah-Puri Vande Bharat Express",
                "direction": "DN",
                "priority_rank": 1,
                "chainage_km": 60.0,  # 55 km behind Dhauli, closing fast
                "speed_kmph": 130.0,
                "delay_mins": 2.0,
                "status": "RUNNING_HIGH_SPEED",
                "current_station": None,
                "next_station": "NRG",
            },
            "18410": {
                "name": "Sri Jagannath Express",
                "direction": "UP",
                "priority_rank": 3,
                "chainage_km": 155.0,  # Approaching Bhubaneswar from Khurda Rd
                "speed_kmph": 85.0,
                "delay_mins": 5.0,
                "status": "RUNNING_NORMAL",
                "current_station": None,
                "next_station": "BBS",
            },
        }

        self._injected_freights: dict[str, float] = {"DN_CTC_BRAG": 20.0}

    async def advance_simulation(self, elapsed_wall_seconds: float) -> None:
        """Advances physical train positions by (elapsed_wall_seconds * speed_multiplier)."""
        sim_delta_secs = elapsed_wall_seconds * self.speed_multiplier
        self.sim_clock_secs += int(sim_delta_secs)
        delta_hours = sim_delta_secs / 3600.0

        for t_no, t in self._trains.items():
            # If train is halted at station, transition to moving after 2 minutes
            if t["status"] == "AT_STATION_HALT":
                if sim_delta_secs > 10:
                    t["status"] = "RUNNING_NORMAL"
                    t["speed_kmph"] = 75.0 if t["direction"] == "DN" else 80.0
                    t["current_station"] = None
                continue

            dist_moved = t["speed_kmph"] * delta_hours
            if t["direction"] == "DN":
                new_km = min(206.0, t["chainage_km"] + dist_moved)
                t["chainage_km"] = round(new_km, 2)
                # Check for station arrival
                for stn in self.stations:
                    if abs(new_km - stn["chainage_km"]) < 0.8 and t["status"] != "AT_STATION_HALT":
                        if stn["station_code"] == t.get("next_station"):
                            t["status"] = "AT_STATION_HALT"
                            t["current_station"] = stn["station_code"]
                            t["speed_kmph"] = 0.0
                            break
            else:
                new_km = max(0.0, t["chainage_km"] - dist_moved)
                t["chainage_km"] = round(new_km, 2)

    async def get_corridor_snapshot(self) -> dict[str, Any]:
        """Returns the live snapshot of trains and freight shadows."""
        train_states: list[TrainKinematicState] = []
        for t_no, t in self._trains.items():
            lat, lon = chainage_to_lat_lon(t["chainage_km"], self.stations)
            train_states.append(
                TrainKinematicState(
                    train_no=t_no,
                    train_name=t["name"],
                    direction=t["direction"],
                    priority_rank=t["priority_rank"],
                    chainage_km=t["chainage_km"],
                    lat=lat,
                    lon=lon,
                    speed_kmph=t["speed_kmph"],
                    current_delay_mins=t["delay_mins"],
                    current_station=t["current_station"],
                    next_station=t["next_station"],
                    last_updated_epoch=self.sim_clock_secs,
                    status=t["status"],
                )
            )

        freight_shadows = [
            FreightInferenceResult(
                block_id="DN_CTC_BRAG",
                direction="DN",
                str_value=1.85,
                freight_probability=0.88,
                status="PHANTOM_FREIGHT_SHADOW",
                clearance_station="BRAG",
                clearance_eta_mins=20.0,
            )
        ]


        return {
            "tick_utc": self.sim_clock_secs,
            "mode": f"DEMO_{int(self.speed_multiplier)}X",
            "trains": train_states,
            "phantom_freights": freight_shadows,
            "weather": {"rain_mm_hr": 2.0, "wind_speed_kmph": 14.0, "condition": "OVERCAST"},
        }

    async def set_speed_multiplier(self, multiplier: float) -> None:
        self.speed_multiplier = max(0.5, min(60.0, multiplier))

    async def inject_delay(self, train_no: str, additional_mins: float) -> None:
        if train_no in self._trains:
            self._trains[train_no]["delay_mins"] += additional_mins

    async def inject_freight(self, block_id: str, confidence: float, duration_mins: float) -> None:
        self._injected_freights[block_id] = duration_mins

    async def tick(self) -> dict[str, Any]:
        """Convenience alias for get_corridor_snapshot."""
        return await self.get_corridor_snapshot()

