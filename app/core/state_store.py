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
        self._cause_delays: dict[str, float] = {}
        self._remaining_cause_delays: dict[str, float] = {}
        self._remaining_loop_holds: dict[str, float | None] = {}
        self._active_causes: dict[str, list[str]] = {}
        self._injected_freights: dict[str, float] = {}
        self._goods_rakes: list[dict[str, Any]] = []
        self._last_tick_epoch: int = int(time.time())
        self._active_corridor_id: str = "ECoR_BHC_PURI"

    async def get_active_corridor(self) -> str:
        async with self._lock:
            return self._active_corridor_id

    async def set_active_corridor(self, corridor_id: str) -> None:
        async with self._lock:
            self._active_corridor_id = corridor_id
            self._trains.clear()
            self._freight_shadows.clear()
            self._injected_delays.clear()
            self._cause_delays.clear()
            self._remaining_cause_delays.clear()
            self._remaining_loop_holds.clear()
            self._active_causes.clear()
            self._injected_freights.clear()

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

    async def update_goods_rakes(self, goods_rakes: list[dict[str, Any]]) -> None:
        async with self._lock:
            self._goods_rakes = copy.deepcopy(goods_rakes)

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

    async def set_train_causes(
        self,
        train_no: str,
        causes: list[str],
        direct_delay_mins: float,
        remaining_delay_mins: float | None = None,
    ) -> None:
        async with self._lock:
            prev_delay = self._cause_delays.get(train_no, 0.0)
            self._active_causes[train_no] = list(causes)
            self._cause_delays[train_no] = direct_delay_mins
            self._remaining_cause_delays[train_no] = (
                remaining_delay_mins if remaining_delay_mins is not None else direct_delay_mins
            )
            if train_no in self._trains:
                self._trains[train_no].current_delay_mins = max(
                    0.0, self._trains[train_no].current_delay_mins - prev_delay + direct_delay_mins
                )

    async def set_remaining_cause_delays(
        self,
        remaining_by_train: dict[str, float],
        loop_holds_by_train: dict[str, float | None] | None = None,
    ) -> None:
        """Syncs remaining unexpired timed-cause delay minutes & active loop holds so ETAs never jump."""
        async with self._lock:
            for t_no, rem in remaining_by_train.items():
                self._remaining_cause_delays[t_no] = max(0.0, float(rem))
            if loop_holds_by_train is not None:
                for t_no, hold in loop_holds_by_train.items():
                    self._remaining_loop_holds[t_no] = hold

    async def get_remaining_loop_hold(self, train_no: str) -> float | None:
        async with self._lock:
            return self._remaining_loop_holds.get(train_no)

    async def get_train_causes(self, train_no: str) -> list[str]:
        async with self._lock:
            return list(self._active_causes.get(train_no, []))

    async def get_injected_delay(self, train_no: str) -> float:
        async with self._lock:
            rem_cause = self._remaining_cause_delays.get(
                train_no, self._cause_delays.get(train_no, 0.0)
            )
            return self._injected_delays.get(train_no, 0.0) + rem_cause

    async def get_active_trains(self) -> list[TrainKinematicState]:
        async with self._lock:
            return [copy.deepcopy(t) for t in self._trains.values()]

    async def get_freight_penalties(self) -> dict[str, float]:
        async with self._lock:
            penalties: dict[str, float] = dict(self._injected_freights)
            for block_id, shadow in self._freight_shadows.items():
                if shadow.status in ("PHANTOM_FREIGHT_SHADOW", "ULIP_FOIS_CONFIRMED"):
                    if shadow.block_penalty_mins is not None:
                        penalties[block_id] = float(shadow.block_penalty_mins)
                    else:
                        clearance = float(shadow.clearance_eta_mins) if shadow.clearance_eta_mins else 20.0
                        penalties[block_id] = penalties.get(block_id, clearance)
            return penalties


    async def get_snapshot(self) -> dict[str, Any]:
        async with self._lock:
            data_quality = "LIVE_SIM" if self._provider_mode == "DEMO_SIMULATION" else "LIVE_FEED"
            return {
                "corridor_id": self._active_corridor_id,
                "tick_utc": self._last_tick_epoch,
                "mode": self._provider_mode,
                "data_quality": data_quality,
                "speed_multiplier": self._speed_multiplier,
                "trains": [t.model_dump() for t in self._trains.values()],
                "phantom_freights": [f.model_dump() for f in self._freight_shadows.values()],
                "goods_rakes": copy.deepcopy(self._goods_rakes),
                "weather": copy.deepcopy(self._weather),
            }

    async def reset(self) -> None:
        async with self._lock:
            self._trains.clear()
            self._freight_shadows.clear()
            self._injected_delays.clear()
            self._cause_delays.clear()
            self._remaining_cause_delays.clear()
            self._remaining_loop_holds.clear()
            self._active_causes.clear()
            self._injected_freights.clear()
            self._goods_rakes.clear()
            self._speed_multiplier = 1.0


# Global singleton instance
state_store = CorridorStateStore()
