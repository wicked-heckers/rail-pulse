import asyncio
import copy
import time
from typing import Any

from app.models.schemas import FreightInferenceResult, TrainKinematicState


class CorridorStateStore:
    """
    In-Process Thread/Async-Safe Corridor State Mirror.
    Stores the authoritative live state of all trains, phantom freights,
    and weather on the corridor in RAM for sub-5ms REST & WebSocket reads.
    """

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._trains: dict[str, TrainKinematicState] = {}
        self._freight_shadows: dict[str, FreightInferenceResult] = {}
        self._weather: dict[str, Any] = {
            "rain_mm_hr": 0.0,
            "wind_speed_kmph": 12.0,
            "condition": "CLEAR",
        }
        self._provider_mode: str = "DEMO_SIMULATION"
        self._speed_multiplier: float = 1.0
        self._injected_delays: dict[str, float] = {}
        self._injected_freights: dict[str, float] = {}
        self._last_tick_epoch: int = int(time.time())

    async def update_trains(self, trains: list[TrainKinematicState]) -> None:
        async with self._lock:
            for t in trains:
                self._trains[t.train_no] = t
            if trains and trains[0].last_updated_epoch > 0:
                self._last_tick_epoch = trains[0].last_updated_epoch
            else:
                self._last_tick_epoch = int(time.time())


    async def update_freight_shadows(self, shadows: list[FreightInferenceResult]) -> None:
        async with self._lock:
            self._freight_shadows = {s.block_id: s for s in shadows}

    async def update_weather(self, weather_data: dict[str, Any]) -> None:
        async with self._lock:
            self._weather = weather_data

    async def set_provider_mode(self, mode: str) -> None:
        async with self._lock:
            self._provider_mode = mode

    async def get_provider_mode(self) -> str:
        async with self._lock:
            return self._provider_mode

    async def set_speed_multiplier(self, multiplier: float) -> None:
        async with self._lock:
            self._speed_multiplier = max(0.5, min(60.0, multiplier))

    async def inject_train_delay(self, train_no: str, additional_mins: float) -> None:
        async with self._lock:
            self._injected_delays[train_no] = self._injected_delays.get(train_no, 0.0) + additional_mins
            if train_no in self._trains:
                self._trains[train_no].current_delay_mins += additional_mins

    async def inject_freight_shadow(
        self, block_id: str, penalty_mins: float, confidence: float = 0.88
    ) -> None:
        async with self._lock:
            self._injected_freights[block_id] = penalty_mins
            direction = "DN" if "DN" in block_id else "UP"
            self._freight_shadows[block_id] = FreightInferenceResult(
                block_id=block_id,
                direction=direction,
                str_value=1.85,
                freight_probability=confidence,
                status="PHANTOM_FREIGHT_SHADOW",
                clearance_station="BRAG" if "BRAG" in block_id else "NRG",
                clearance_eta_mins=penalty_mins,
            )

    async def get_active_trains(self) -> list[TrainKinematicState]:
        async with self._lock:
            return [copy.deepcopy(t) for t in self._trains.values()]

    async def get_freight_penalties(self) -> dict[str, float]:
        async with self._lock:
            penalties: dict[str, float] = dict(self._injected_freights)
            for block_id, shadow in self._freight_shadows.items():
                if shadow.status in ("PHANTOM_FREIGHT_SHADOW", "ULIP_FOIS_CONFIRMED"):
                    clearance = float(shadow.clearance_eta_mins) if shadow.clearance_eta_mins else 20.0
                    penalties[block_id] = penalties.get(block_id, clearance)
            return penalties


    async def get_snapshot(self) -> dict[str, Any]:
        async with self._lock:
            data_quality = "LIVE_SIM" if self._provider_mode == "DEMO_SIMULATION" else "LIVE_FEED"
            return {
                "tick_utc": self._last_tick_epoch,
                "mode": self._provider_mode,
                "data_quality": data_quality,
                "speed_multiplier": self._speed_multiplier,
                "trains": [t.model_dump() for t in self._trains.values()],
                "phantom_freights": [f.model_dump() for f in self._freight_shadows.values()],
                "weather": copy.deepcopy(self._weather),
            }

    async def reset(self) -> None:
        async with self._lock:
            self._trains.clear()
            self._freight_shadows.clear()
            self._injected_delays.clear()
            self._injected_freights.clear()
            self._speed_multiplier = 1.0


# Global singleton instance
state_store = CorridorStateStore()
