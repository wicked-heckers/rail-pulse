import copy
import json
import logging
from pathlib import Path
from typing import Any

from app.config import settings
from app.core.database import LocalTopologyFallback
from app.engine.chainage_mapper import chainage_to_lat_lon
from app.ingestion.base import CorridorDataProvider
from app.models.schemas import FreightInferenceResult, TrainKinematicState

logger = logging.getLogger("railpulse.replay_provider")


class ReplayProvider(CorridorDataProvider):
    """
    Automatic Local Replay Provider.
    Loads calibrated ECoR corridor snapshots from disk and advances train
    positions deterministically so the pipeline continues running seamlessly
    during upstream network drops or API outages.
    """

    def __init__(
        self,
        snapshot_path: Path | None = None,
        speed_multiplier: float = 1.0,
    ) -> None:
        self.snapshot_path = snapshot_path or settings.FALLBACK_SNAPSHOTS_PATH
        self.speed_multiplier = speed_multiplier
        self.topology = LocalTopologyFallback.load_topology()
        self.stations = self.topology.get("stations", [])
        self._initial_data: dict[str, Any] = self._load_snapshot_file()
        self._sim_clock_secs: int = int(self._initial_data.get("tick_utc", 1795071600))
        self._trains: list[dict[str, Any]] = []
        self._freights: list[FreightInferenceResult] = []
        self._weather: dict[str, Any] = {}
        self._reset_from_initial()

    def _load_snapshot_file(self) -> dict[str, Any]:
        if not self.snapshot_path.exists():
            logger.warning("Fallback snapshot file not found at %s; using empty state.", self.snapshot_path)
            return {"tick_utc": 1795071600, "trains": [], "phantom_freights": [], "weather": {}}
        with open(self.snapshot_path, encoding="utf-8") as f:
            return json.load(f)

    def _reset_from_initial(self) -> None:
        self._sim_clock_secs = int(self._initial_data.get("tick_utc", 1795071600))
        self._trains = copy.deepcopy(self._initial_data.get("trains", []))
        raw_freights = self._initial_data.get("phantom_freights", [])
        self._freights = [FreightInferenceResult(**f) for f in raw_freights]
        self._weather = copy.deepcopy(
            self._initial_data.get(
                "weather",
                {"rain_mm_hr": 0.0, "wind_speed_kmph": 12.0, "condition": "CLEAR"},
            )
        )

    async def reset(self) -> None:
        self._reset_from_initial()

    async def advance_simulation(self, elapsed_wall_seconds: float) -> None:
        """Advances replayed train positions along the corridor; loops if all reach terminals."""
        sim_delta_secs = elapsed_wall_seconds * self.speed_multiplier
        self._sim_clock_secs += int(sim_delta_secs)
        delta_hours = sim_delta_secs / 3600.0

        all_at_terminal = bool(self._trains)
        for t in self._trains:
            if t.get("status") == "AT_TERMINUS":
                t["speed_kmph"] = 0.0
                continue

            if t.get("status") == "AT_STATION_HALT":
                all_at_terminal = False
                if sim_delta_secs > 10:
                    t["status"] = "RUNNING_NORMAL"
                    t["speed_kmph"] = 75.0 if t.get("direction") == "DN" else 80.0
                    t["current_station"] = None
                continue

            speed = float(t.get("speed_kmph", 0.0))
            dist_moved = speed * delta_hours
            if t.get("direction") == "DN":
                new_km = min(settings.CORRIDOR_END_KM, float(t.get("chainage_km", 0.0)) + dist_moved)
                t["chainage_km"] = round(new_km, 2)
                if new_km >= settings.CORRIDOR_END_KM:
                    t["speed_kmph"] = 0.0
                    t["status"] = "AT_TERMINUS"
                    t["current_station"] = "PURI"
                    t["next_station"] = None
                else:
                    all_at_terminal = False
            else:
                new_km = max(settings.CORRIDOR_START_KM, float(t.get("chainage_km", 0.0)) - dist_moved)
                t["chainage_km"] = round(new_km, 2)
                if new_km <= settings.CORRIDOR_START_KM:
                    t["speed_kmph"] = 0.0
                    t["status"] = "AT_TERMINUS"
                    t["current_station"] = "BHC"
                    t["next_station"] = None
                else:
                    all_at_terminal = False

        if all_at_terminal and self._trains:
            logger.info("Replay loop reached corridor terminals; resetting replay buffer.")
            self._reset_from_initial()

    async def get_corridor_snapshot(self) -> dict[str, Any]:
        """Returns the normalized corridor snapshot in REPLAY mode."""
        train_states: list[TrainKinematicState] = []
        for t in self._trains:
            chainage = float(t.get("chainage_km", 0.0))
            lat, lon = chainage_to_lat_lon(chainage, self.stations) if self.stations else (t.get("lat"), t.get("lon"))
            train_states.append(
                TrainKinematicState(
                    train_no=str(t["train_no"]),
                    train_name=str(t["train_name"]),
                    direction=t["direction"],
                    priority_rank=int(t.get("priority_rank", 3)),
                    chainage_km=chainage,
                    lat=lat,
                    lon=lon,
                    speed_kmph=float(t.get("speed_kmph", 0.0)),
                    current_delay_mins=float(t.get("current_delay_mins", 0.0)),
                    current_station=t.get("current_station"),
                    next_station=t.get("next_station"),
                    last_updated_epoch=self._sim_clock_secs,
                    status=str(t.get("status", "RUNNING_NORMAL")),
                )
            )

        return {
            "tick_utc": self._sim_clock_secs,
            "mode": "REPLAY",
            "trains": train_states,
            "phantom_freights": list(self._freights),
            "weather": copy.deepcopy(self._weather),
        }

    async def set_speed_multiplier(self, multiplier: float) -> None:
        self.speed_multiplier = max(0.5, min(60.0, multiplier))

    async def inject_delay(self, train_no: str, additional_mins: float) -> None:
        for t in self._trains:
            if t.get("train_no") == train_no:
                t["current_delay_mins"] = float(t.get("current_delay_mins", 0.0)) + additional_mins

    async def inject_freight(self, block_id: str, confidence: float, duration_mins: float) -> None:
        self._freights = [
            f for f in self._freights if f.block_id != block_id
        ]
        direction = "UP" if block_id.startswith("UP_") else "DN"
        self._freights.append(
            FreightInferenceResult(
                block_id=block_id,
                direction=direction,
                str_value=1.85,
                freight_probability=confidence,
                status="PHANTOM_FREIGHT_SHADOW",
                clearance_eta_mins=duration_mins,
            )
        )
