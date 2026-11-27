import copy
import logging
import random
from typing import Any

from app.core.database import LocalTopologyFallback
from app.engine.chainage_mapper import chainage_to_lat_lon
from app.engine.disruption_causes import DISRUPTION_CAUSE_CATALOG
from app.engine.freight_shadow import (
    _find_clearance_loop,
    compute_str,
    evaluate_freight_probability,
)
from app.ingestion.base import CorridorDataProvider
from app.models.schemas import FreightInferenceResult, TrainKinematicState

logger = logging.getLogger("railpulse.demo_provider")


class DemoSimulationProvider(CorridorDataProvider):
    """
    Deterministic ECoR corridor time-warped simulation engine.
    Starts at 11:25:00 AM IST (1795067700) to align cleanly with published
    ECoR corridor halts and schedules.
    """

    CAUSE_PHYSICS: dict[str, dict[str, Any]] = {
        "TSR_MAINTENANCE": {"speed_kmph": 30.0, "status": "TSR_CAUTION"},
        "SIGNAL_CONGESTION": {"speed_kmph": 45.0, "status": "SIGNAL_CONGESTION"},
        "MONSOON_RAIN": {"speed_factor": 0.65, "status": "WEATHER_CAUTION"},
        "PLATFORM_HOLD": {"speed_kmph": 0.0, "status": "PLATFORM_HOLD"},
        "OHE_BRAKE_FAULT": {"speed_kmph": 0.0, "status": "OHE_BRAKE_HOLD"},
    }

    def __init__(
        self,
        speed_multiplier: float = 1.0,
        scenario_mode: bool = False,
        scenario_name: str = "DHAULI_CASCADE",
        corridor_id: str | None = None,
    ) -> None:
        self.speed_multiplier = speed_multiplier
        self.scenario_mode = scenario_mode
        self.scenario_name = scenario_name
        self.sim_clock_secs = 1795067700  # 11:25:00 AM IST (2026-11-19)
        self._sim_clock_exact: float = float(self.sim_clock_secs)
        self.corridor_id = corridor_id or LocalTopologyFallback.get_active_corridor_id()
        self.topology = LocalTopologyFallback.load_topology(corridor_id=self.corridor_id)
        self.stations = self.topology["stations"]

        if scenario_mode and scenario_name in ("SANTRAGACHI_CASCADE", "SRC_CASCADE"):
            # Santragachi Junction Disruption & Kona Expressway Road Rescue:
            # 12821 holds at Santragachi Junction (7 km from Howrah) with DN_SRC_ULB freight blockade,
            # while 22895 approaches on mainline, triggering Kona Expressway / Vidyasagar Setu road rescue (18 min drive)
            self._trains = {
                "12821": {
                    "name": "Dhauli Express",
                    "direction": "DN",
                    "priority_rank": 2,
                    "chainage_km": 7.0,
                    "speed_kmph": 0.0,
                    "delay_mins": 25.0,
                    "status": "AT_STATION_HALT",
                    "current_station": "SRC",
                    "next_station": "ULB",
                },
                "22895": {
                    "name": "Howrah-Puri Vande Bharat Express",
                    "direction": "DN",
                    "priority_rank": 1,
                    "chainage_km": 0.0,
                    "speed_kmph": 90.0,
                    "delay_mins": 0.0,
                    "status": "RUNNING_HIGH_SPEED",
                    "current_station": None,
                    "next_station": "SRC",
                },
                "12822": {
                    "name": "Dhauli Express",
                    "direction": "UP",
                    "priority_rank": 2,
                    "chainage_km": 58.0,
                    "speed_kmph": 110.0,
                    "delay_mins": 3.0,
                    "status": "RUNNING_NORMAL",
                    "current_station": None,
                    "next_station": "BZN",
                },
            }
            self._injected_freights = {"DN_SRC_ULB": 20.0}
            self.rain_mm_hr = 0.0
            self.weather_condition = "CLEAR"
        elif scenario_mode and (
            scenario_name in ("KOLKATA_CASCADE", "KGP_CASCADE", "SER_CASCADE")
            or (
                self.corridor_id == "SER_HWH_KGP"
                and scenario_name not in ("OVERTAKE_ONLY", "KHURDA_CASCADE", "KUR_CASCADE", "DHAULI_CASCADE")
            )
        ):
            # Kolkata Trunk Line Disruption & Loop Overtake Scenario:
            # 12821 holds at Mecheda Junction (58 km) loop line with DN_MCA_PKU freight drag,
            # while 22895 Vande Bharat closes at 130 km/h on mainline,
            # triggering Kona Expressway / NH-16 road rescue back to Howrah or ahead to Kharagpur
            self._trains = {
                "12821": {
                    "name": "Dhauli Express",
                    "direction": "DN",
                    "priority_rank": 2,
                    "chainage_km": 58.0,
                    "speed_kmph": 0.0,
                    "delay_mins": 24.0,
                    "status": "AT_STATION_HALT",
                    "current_station": "MCA",
                    "next_station": "PKU",
                },
                "22895": {
                    "name": "Howrah-Puri Vande Bharat Express",
                    "direction": "DN",
                    "priority_rank": 1,
                    "chainage_km": 32.0,
                    "speed_kmph": 130.0,
                    "delay_mins": 2.0,
                    "status": "RUNNING_HIGH_SPEED",
                    "current_station": None,
                    "next_station": "MCA",
                },
                "12822": {
                    "name": "Dhauli Express",
                    "direction": "UP",
                    "priority_rank": 2,
                    "chainage_km": 91.0,
                    "speed_kmph": 105.0,
                    "delay_mins": 4.0,
                    "status": "RUNNING_NORMAL",
                    "current_station": None,
                    "next_station": "PKU",
                },
            }
            self._injected_freights = {"DN_MCA_PKU": 20.0}
            self.rain_mm_hr = 0.0
            self.weather_condition = "CLEAR"
        elif scenario_mode and scenario_name == "OVERTAKE_ONLY":
            # Smooth Bhubaneswar Loop-Line Overtake: 12821 slows into BBS (143 km) and waits for fast 22895
            self._trains = {
                "12821": {
                    "name": "Dhauli Express",
                    "direction": "DN",
                    "priority_rank": 2,
                    "chainage_km": 136.0,  # Approaching Bhubaneswar (143 km) to enter loop hold
                    "speed_kmph": 60.0,
                    "delay_mins": 16.0,
                    "status": "RUNNING_NORMAL",
                    "current_station": None,
                    "next_station": "BBS",
                },
                "22895": {
                    "name": "Howrah-Puri Vande Bharat Express",
                    "direction": "DN",
                    "priority_rank": 1,
                    "chainage_km": 115.0,  # At Cuttack, closing fast at 160 km/h
                    "speed_kmph": 160.0,
                    "delay_mins": 0.0,
                    "status": "RUNNING_HIGH_SPEED",
                    "current_station": None,
                    "next_station": "BBS",
                },
                "18410": {
                    "name": "Sri Jagannath Express",
                    "direction": "UP",
                    "priority_rank": 3,
                    "chainage_km": 155.0,
                    "speed_kmph": 110.0,
                    "delay_mins": 0.0,
                    "status": "RUNNING_NORMAL",
                    "current_station": None,
                    "next_station": "BBS",
                },
            }
            self._injected_freights = {}
            self.rain_mm_hr = 0.0
            self.weather_condition = "CLEAR"
        elif scenario_mode and scenario_name in ("KHURDA_CASCADE", "KUR_CASCADE"):
            # Khurda Road Junction Disruption & Loop Overtake Scenario:
            # 12821 holds at Khurda Road Junction (162 km) with DN_KUR_PURI freight blockade,
            # while 22895 closes on mainline, triggering NH-16/NH-316 early junction rescue
            self._trains = {
                "12821": {
                    "name": "Dhauli Express",
                    "direction": "DN",
                    "priority_rank": 2,
                    "chainage_km": 162.0,  # At Khurda Road Junction entering loop hold
                    "speed_kmph": 0.0,
                    "delay_mins": 26.0,
                    "status": "AT_STATION_HALT",
                    "current_station": "KUR",
                    "next_station": "PURI",
                },
                "22895": {
                    "name": "Howrah-Puri Vande Bharat Express",
                    "direction": "DN",
                    "priority_rank": 1,
                    "chainage_km": 143.0,  # Passing Bhubaneswar closing fast on mainline
                    "speed_kmph": 130.0,
                    "delay_mins": 2.0,
                    "status": "RUNNING_HIGH_SPEED",
                    "current_station": None,
                    "next_station": "KUR",
                },
                "18410": {
                    "name": "Sri Jagannath Express",
                    "direction": "UP",
                    "priority_rank": 3,
                    "chainage_km": 180.0,  # Approaching Khurda Road from Puri
                    "speed_kmph": 95.0,
                    "delay_mins": 5.0,
                    "status": "RUNNING_NORMAL",
                    "current_station": None,
                    "next_station": "KUR",
                },
            }
            self._injected_freights = {"DN_KUR_PURI": 20.0}
            self.rain_mm_hr = 0.0
            self.weather_condition = "CLEAR"
        elif scenario_mode:
            # Disrupted SIH26028 cascade preset
            self._trains = {
                "12821": {
                    "name": "Dhauli Express",
                    "direction": "DN",
                    "priority_rank": 2,
                    "chainage_km": 115.0,  # Departing Cuttack into DN_CTC_BRAG freight block
                    "speed_kmph": 29.0,
                    "delay_mins": 28.0,
                    "status": "CRAWLING_FREIGHT_DRAG",
                    "current_station": None,
                    "next_station": "BRAG",
                },
                "22895": {
                    "name": "Howrah-Puri Vande Bharat Express",
                    "direction": "DN",
                    "priority_rank": 1,
                    "chainage_km": 60.0,
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
                    "chainage_km": 155.0,
                    "speed_kmph": 110.0,
                    "delay_mins": 5.0,
                    "status": "RUNNING_NORMAL",
                    "current_station": None,
                    "next_station": "BBS",
                },
            }
            self._injected_freights = {"DN_CTC_BRAG": 20.0}
            self.rain_mm_hr = 2.0
            self.weather_condition = "OVERCAST"
        else:
            # Clean "Where Is My Train" baseline: all trains running on time, clear tracks
            if self.corridor_id == "SER_HWH_KGP":
                self._trains = {
                    "12821": {
                        "name": "Dhauli Express",
                        "direction": "DN",
                        "priority_rank": 2,
                        "chainage_km": 58.0,
                        "speed_kmph": 110.0,
                        "delay_mins": 0.0,
                        "status": "RUNNING_NORMAL",
                        "current_station": None,
                        "next_station": "PKU",
                    },
                    "22895": {
                        "name": "Howrah-Puri Vande Bharat Express",
                        "direction": "DN",
                        "priority_rank": 1,
                        "chainage_km": 20.0,
                        "speed_kmph": 130.0,
                        "delay_mins": 0.0,
                        "status": "RUNNING_HIGH_SPEED",
                        "current_station": None,
                        "next_station": "ULB",
                    },
                    "12822": {
                        "name": "Dhauli Express",
                        "direction": "UP",
                        "priority_rank": 2,
                        "chainage_km": 95.0,
                        "speed_kmph": 110.0,
                        "delay_mins": 0.0,
                        "status": "RUNNING_NORMAL",
                        "current_station": None,
                        "next_station": "BCK",
                    },
                }
                self._injected_freights = {}
                self.rain_mm_hr = 0.0
                self.weather_condition = "CLEAR"
            else:
                self._trains = {
                    "12821": {
                        "name": "Dhauli Express",
                        "direction": "DN",
                        "priority_rank": 2,
                        "chainage_km": 115.0,  # Departing Cuttack on time
                        "speed_kmph": 110.0,
                        "delay_mins": 0.0,
                        "status": "RUNNING_NORMAL",
                        "current_station": None,
                        "next_station": "BRAG",
                    },
                    "22895": {
                        "name": "Howrah-Puri Vande Bharat Express",
                        "direction": "DN",
                        "priority_rank": 1,
                        "chainage_km": 60.0,
                        "speed_kmph": 130.0,
                        "delay_mins": 0.0,
                        "status": "RUNNING_HIGH_SPEED",
                        "current_station": None,
                        "next_station": "NRG",
                    },
                    "18410": {
                        "name": "Sri Jagannath Express",
                        "direction": "UP",
                        "priority_rank": 3,
                        "chainage_km": 155.0,
                        "speed_kmph": 110.0,
                        "delay_mins": 0.0,
                        "status": "RUNNING_NORMAL",
                        "current_station": None,
                        "next_station": "BBS",
                    },
                }
                self._injected_freights = {}
                self.rain_mm_hr = 0.0
                self.weather_condition = "CLEAR"

        self._baseline_delays: dict[str, float] = {
            t_no: float(t["delay_mins"]) for t_no, t in self._trains.items()
        }
        self._manual_delays: dict[str, float] = {}
        self._active_causes: dict[str, list[str]] = {}
        self._active_cause_effects: dict[str, list[dict[str, Any]]] = {}
        self._accrued_cause_delays: dict[str, float] = {}
        self._accrued_freight_delays: dict[str, float] = {}
        self._accrued_loop_delays: dict[str, float] = {}
        self._freight_cause_blocks: dict[str, str] = {}
        self._hidden_goods_trains: list[dict[str, Any]] = []
        self._detected_freight_meta: dict[str, dict[str, Any]] = {}
        self._random_freight_blocks: set[str] = set()
        self._auto_random_freight: bool = False
        is_santragachi_cascade = bool(scenario_mode and scenario_name in ("SANTRAGACHI_CASCADE", "SRC_CASCADE"))
        is_kolkata_cascade = bool(
            scenario_mode
            and not is_santragachi_cascade
            and (
                scenario_name in ("KOLKATA_CASCADE", "KGP_CASCADE", "SER_CASCADE")
                or (
                    self.corridor_id == "SER_HWH_KGP"
                    and scenario_name not in ("OVERTAKE_ONLY", "KHURDA_CASCADE", "KUR_CASCADE", "DHAULI_CASCADE")
                )
            )
        )
        is_dhauli_cascade = bool(scenario_mode and scenario_name == "DHAULI_CASCADE")
        is_khurda_cascade = bool(scenario_mode and scenario_name in ("KHURDA_CASCADE", "KUR_CASCADE"))
        self._hold_until_overtaken: bool = bool(scenario_mode)
        if is_santragachi_cascade:
            self._overtake_target_km = 7.0
            self._overtake_target_code = "SRC"
            self._overtake_min_hold_secs = 720.0
        elif is_kolkata_cascade:
            self._overtake_target_km = 58.0
            self._overtake_target_code = "MCA"
            self._overtake_min_hold_secs = 720.0
        elif is_khurda_cascade:
            self._overtake_target_km = 162.0
            self._overtake_target_code = "KUR"
            self._overtake_min_hold_secs = 720.0
        elif is_dhauli_cascade:
            self._overtake_target_km = 128.0
            self._overtake_target_code = "BRAG"
            self._overtake_min_hold_secs = 960.0
        else:
            self._overtake_target_km = 143.0
            self._overtake_target_code = "BBS"
            self._overtake_min_hold_secs = 0.0

        self._initial_scenario_mode = scenario_mode
        self._initial_scenario_name = scenario_name
        self._initial_trains = copy.deepcopy(self._trains)
        self._initial_injected_freights = copy.deepcopy(self._injected_freights)
        self._all_terminated_secs: float = 0.0

        self._trains_master = {
            t["train_no"]: t for t in self.topology.get("trains", [])
        }

    def _compute_current_delay(self, t_no: str) -> float:
        """
        Calculates total delay for t_no across all additive components:
        baseline timetable offset + manual injections + accrued cause penalties +
        accrued freight crawl delay + accrued loop hold delay + remaining unexpired cause duration.
        """
        base = self._baseline_delays.get(t_no, 0.0)
        manual = self._manual_delays.get(t_no, 0.0)
        cause_accrued = self._accrued_cause_delays.get(t_no, 0.0)
        freight_accrued = self._accrued_freight_delays.get(t_no, 0.0)
        loop_accrued = self._accrued_loop_delays.get(t_no, 0.0)
        cause_rem = self.get_remaining_cause_delay(t_no)
        return round(base + manual + cause_accrued + freight_accrued + loop_accrued + cause_rem, 1)

    def reset_cycle(self) -> None:
        """Smoothly resets train coordinates and active causes to nominal initial scenario."""
        self._all_terminated_secs = 0.0
        self._active_causes.clear()
        self._active_cause_effects.clear()
        self._accrued_cause_delays.clear()
        self._accrued_freight_delays.clear()
        self._accrued_loop_delays.clear()
        self._manual_delays.clear()
        self._hidden_goods_trains.clear()
        self._detected_freight_meta.clear()
        for blk_id in list(self._random_freight_blocks):
            self._initial_injected_freights.pop(blk_id, None)
        self._random_freight_blocks.clear()
        self._trains = copy.deepcopy(self._initial_trains)
        self._injected_freights = copy.deepcopy(self._initial_injected_freights)
        if self._auto_random_freight and not self._initial_scenario_mode:
            self.spawn_random_goods_train(target_train_no="12821", auto_respawn=True)
        is_santragachi_cascade = bool(self._initial_scenario_mode and self._initial_scenario_name in ("SANTRAGACHI_CASCADE", "SRC_CASCADE"))
        is_kolkata_cascade = bool(
            self._initial_scenario_mode
            and not is_santragachi_cascade
            and (
                self._initial_scenario_name in ("KOLKATA_CASCADE", "KGP_CASCADE", "SER_CASCADE")
                or (
                    self.corridor_id == "SER_HWH_KGP"
                    and self._initial_scenario_name not in ("OVERTAKE_ONLY", "KHURDA_CASCADE", "KUR_CASCADE", "DHAULI_CASCADE")
                )
            )
        )
        is_dhauli_cascade = bool(self._initial_scenario_mode and self._initial_scenario_name == "DHAULI_CASCADE")
        is_khurda_cascade = bool(self._initial_scenario_mode and self._initial_scenario_name in ("KHURDA_CASCADE", "KUR_CASCADE"))
        self._hold_until_overtaken = bool(self._initial_scenario_mode)
        if is_santragachi_cascade:
            self._overtake_target_km = 7.0
            self._overtake_target_code = "SRC"
            self._overtake_min_hold_secs = 720.0
        elif is_kolkata_cascade:
            self._overtake_target_km = 58.0
            self._overtake_target_code = "MCA"
            self._overtake_min_hold_secs = 720.0
        elif is_khurda_cascade:
            self._overtake_target_km = 162.0
            self._overtake_target_code = "KUR"
            self._overtake_min_hold_secs = 720.0
        elif is_dhauli_cascade:
            self._overtake_target_km = 128.0
            self._overtake_target_code = "BRAG"
            self._overtake_min_hold_secs = 960.0
        else:
            self._overtake_target_km = 143.0
            self._overtake_target_code = "BBS"
            self._overtake_min_hold_secs = 0.0

    def _commercial_dwell_secs(self, train_no: str, stn: dict[str, Any]) -> float:
        master = self._trains_master.get(train_no)
        if master and master.get("halts"):
            halt = next(
                (h for h in master["halts"] if h["station_code"] == stn["station_code"]),
                None,
            )
            if not halt:
                return 0.0
            return float(halt.get("scheduled_dwell_m", 2)) * 60.0
        corridor_end_km = float(self.stations[-1]["chainage_km"]) if self.stations else 206.0
        if stn.get("is_major_junction", False) and float(stn["chainage_km"]) not in (0.0, corridor_end_km):
            return 120.0
        return 0.0

    def get_remaining_cause_delay(self, train_no: str) -> float:
        """Total remaining unexpired delay minutes for active timed causes on train_no."""
        return round(
            sum(
                float(e.get("remaining_delay_mins", 0.0))
                for e in self._active_cause_effects.get(train_no, [])
            ),
            2,
        )

    def get_all_remaining_cause_delays(self) -> dict[str, float]:
        return {t_no: self.get_remaining_cause_delay(t_no) for t_no in self._trains}

    def get_all_remaining_loop_holds(self) -> dict[str, float | None]:
        """Returns remaining loop-line overtake hold minutes while 12821 is physically waiting in loop."""
        result: dict[str, float | None] = {t_no: None for t_no in self._trains}
        if self._hold_until_overtaken and "12821" in self._trains:
            d = self._trains["12821"]
            if (
                d.get("status") == "AT_STATION_HALT"
                and d.get("current_station") == self._overtake_target_code
            ):
                if self._overtake_min_hold_secs > 0.0:
                    rem_secs = max(
                        0.0, self._overtake_min_hold_secs - float(d.get("_overtake_hold_secs", 0.0))
                    )
                    result["12821"] = round(rem_secs / 60.0, 2)
                else:
                    vande = self._trains.get("22895", {})
                    v_km = float(vande.get("chainage_km", 0.0))
                    v_spd = max(60.0, float(vande.get("speed_kmph", 130.0)))
                    rem_mins = max(0.5, ((self._overtake_target_km + 3.0 - v_km) / v_spd) * 60.0)
                    result["12821"] = round(rem_mins, 2)
        return result

    def spawn_random_goods_train(
        self,
        target_train_no: str | None = None,
        block_id: str | None = None,
        seed: int | None = None,
        auto_respawn: bool = True,
    ) -> dict[str, Any]:
        """
        Places an undetected slow goods train randomly on an upcoming track block.
        Initially it produces zero delay and zero phantom freight prediction; only after a
        passenger train physically reaches it, slows down, and the AI STR + Bayesian model
        completes its prediction does the freight alert and delay take effect.
        """
        rng = random.Random(seed)
        blocks = self.topology.get("track_blocks", [])
        stn_by_code = {s["station_code"]: s for s in self.stations}
        stations_by_km = {s["station_code"]: float(s["chainage_km"]) for s in self.stations}

        # Clean previous auto-spawned random goods rakes so state remains unambiguous
        for prev_blk in list(self._random_freight_blocks):
            self._injected_freights.pop(prev_blk, None)
            self._detected_freight_meta.pop(prev_blk, None)
        self._random_freight_blocks.clear()
        self._hidden_goods_trains.clear()

        chosen_block: dict[str, Any] | None = None
        ref_train_no: str | None = None
        ref_train_km: float | None = None

        if block_id:
            chosen_block = next((b for b in blocks if b["block_id"] == block_id), None)

        if chosen_block is None:
            candidates: list[tuple[dict[str, Any], str, float]] = []
            for t_no, t in self._trains.items():
                if target_train_no and t_no != target_train_no:
                    continue
                if t.get("status") == "AT_TERMINUS":
                    continue
                t_dir = t["direction"]
                t_km = float(t["chainage_km"])
                for blk in blocks:
                    if blk["direction"] != t_dir:
                        continue
                    to_stn = stn_by_code.get(blk["to_station"], {})
                    if not to_stn.get("has_750m_goods_loop", False):
                        continue
                    b_lo = min(float(blk["start_km"]), float(blk["end_km"]))
                    b_hi = max(float(blk["start_km"]), float(blk["end_km"]))
                    if (b_hi - b_lo) < 6.0:
                        continue
                    if t_dir == "DN":
                        lo_p = max(b_lo + 1.5, t_km + 2.0)
                        if lo_p < b_hi - 2.2 and (b_hi - t_km) <= 65.0:
                            candidates.append((blk, t_no, t_km))
                    else:
                        hi_p = min(b_hi - 1.5, t_km - 2.0)
                        if hi_p > b_lo + 2.2 and (t_km - b_lo) <= 65.0:
                            candidates.append((blk, t_no, t_km))

            if candidates:
                chosen_block, ref_train_no, ref_train_km = rng.choice(candidates)
            else:
                loop_blocks = [
                    b for b in blocks
                    if stn_by_code.get(b["to_station"], {}).get("has_750m_goods_loop", False)
                    and abs(float(b["end_km"]) - float(b["start_km"])) >= 6.0
                ]
                chosen_block = rng.choice(loop_blocks or blocks)

        assert chosen_block is not None
        b_dir = chosen_block["direction"]
        b_lo = min(float(chosen_block["start_km"]), float(chosen_block["end_km"]))
        b_hi = max(float(chosen_block["start_km"]), float(chosen_block["end_km"]))

        if ref_train_km is None:
            same_dir = [
                (t_no, float(t["chainage_km"]))
                for t_no, t in self._trains.items()
                if t["direction"] == b_dir and t.get("status") != "AT_TERMINUS"
            ]
            if same_dir:
                same_dir.sort(
                    key=lambda item: abs(item[1] - (b_lo if b_dir == "DN" else b_hi))
                )
                ref_train_no, ref_train_km = same_dir[0]

        if b_dir == "DN":
            anchor = ref_train_km if ref_train_km is not None else b_lo
            lo_p = max(b_lo + 1.5, anchor + 2.0)
            hi_p = max(lo_p + 0.5, b_hi - 2.2)
            # Keep random start within a reasonable reachable window when a train is close
            upper_cap = min(hi_p, lo_p + 6.5) if lo_p < hi_p else hi_p
            start_km = round(rng.uniform(min(lo_p, upper_cap), upper_cap), 2)
        else:
            anchor = ref_train_km if ref_train_km is not None else b_hi
            hi_p = min(b_hi - 1.5, anchor - 2.0)
            lo_p = min(hi_p - 0.5, b_lo + 2.2)
            lower_cap = max(lo_p, hi_p - 6.5) if hi_p > lo_p else lo_p
            start_km = round(rng.uniform(lower_cap, max(lower_cap, hi_p)), 2)

        clearance_stn, _ = _find_clearance_loop(chosen_block, self.stations)
        clearance_km = stations_by_km.get(
            clearance_stn or chosen_block["to_station"], float(chosen_block["end_km"])
        )

        rake_id = f"BOXN_GOODS_{rng.randint(1000, 9999)}"
        goods_entry: dict[str, Any] = {
            "rake_id": rake_id,
            "block_id": chosen_block["block_id"],
            "from_station": chosen_block["from_station"],
            "to_station": chosen_block["to_station"],
            "direction": b_dir,
            "chainage_km": start_km,
            "initial_km": start_km,
            "speed_kmph": 28.0,
            "clearance_station": clearance_stn or chosen_block["to_station"],
            "clearance_km": clearance_km,
            "slowed_trains": {},
            "detected": False,
            "detected_by_train": None,
            "str_value": None,
            "predicted_accuracy": None,
            "predicted_status": None,
            "predicted_delay_mins": 0.0,
            "scaled_block_penalty": 0.0,
            "cleared": False,
        }
        self._hidden_goods_trains.append(goods_entry)
        self._auto_random_freight = auto_respawn

        return {
            "rake_id": rake_id,
            "block_id": chosen_block["block_id"],
            "direction": b_dir,
            "chainage_km": start_km,
            "speed_kmph": 28.0,
            "clearance_station": goods_entry["clearance_station"],
            "target_train_no": ref_train_no,
        }

    def get_goods_rakes_snapshot(self) -> list[dict[str, Any]]:
        """Diagnostic status of active/detected random goods rakes for UI & API."""
        items: list[dict[str, Any]] = []
        for g in self._hidden_goods_trains:
            if g.get("cleared"):
                phase = "CLEARED_TO_LOOP"
            elif g.get("detected"):
                phase = "PREDICTED_DELAY_ADDED"
            elif g.get("slowed_trains"):
                phase = "SLOWDOWN_ANALYZING"
            else:
                phase = "HIDDEN_ON_TRACK"
            items.append({
                "rake_id": g["rake_id"],
                "block_id": g["block_id"],
                "from_station": g["from_station"],
                "to_station": g["to_station"],
                "direction": g["direction"],
                "chainage_km": g["chainage_km"],
                "speed_kmph": g["speed_kmph"],
                "clearance_station": g["clearance_station"],
                "detected": g["detected"],
                "detected_by_train": g["detected_by_train"],
                "str_value": g["str_value"],
                "predicted_accuracy": g["predicted_accuracy"],
                "predicted_delay_mins": g["predicted_delay_mins"],
                "cleared": g["cleared"],
                "status_phase": phase,
            })
        return items

    def _evaluate_hidden_goods_detection(
        self,
        goods: dict[str, Any],
        train_no: str,
        train_state: dict[str, Any],
        slow_info: dict[str, Any],
    ) -> None:
        """
        Runs the real STR + Bayesian exclusion gate model once a passenger train has
        physically slowed behind an undetected goods train. Adds freight delay and
        phantom_freight shadow ONLY upon prediction completion.
        """
        block = next(
            (b for b in self.topology.get("track_blocks", []) if b["block_id"] == goods["block_id"]),
            None,
        )
        if not block:
            return

        blk_start = float(block["start_km"])
        blk_end = float(block["end_km"])
        blk_len = max(1.0, float(block["length_km"]))
        mps = float(block.get("mps_kmph", 110))
        free_flow_mins = float(block.get("free_flow_mins", (blk_len / max(30.0, mps)) * 60.0))

        # Compute realistic rolling traversal ratio across the affected block:
        # combine pre-slowdown fast run (capped) + sustained caution/crawl traversal
        d_fast = min(blk_len * 0.35, abs(float(slow_info["slowdown_start_km"]) - blk_start))
        d_slow = max(blk_len * 0.65, abs(blk_end - float(slow_info["slowdown_start_km"])))
        caution_avg_spd = min(mps * 0.42, max(28.0, float(goods["speed_kmph"]) * 1.42))
        actual_run_mins = (d_fast / max(30.0, mps)) * 60.0 + (d_slow / caution_avg_spd) * 60.0
        str_val = compute_str(actual_run_mins, free_flow_mins)

        # Compute gap to any preceding coaching train closer than the goods rake
        head_gap_mins: float | None = None
        t_km = float(train_state["chainage_km"])
        g_km = float(goods["chainage_km"])
        dist_to_goods = max(0.0, (g_km - t_km) if goods["direction"] == "DN" else (t_km - g_km))
        for other_no, other in self._trains.items():
            if other_no == train_no or other["direction"] != goods["direction"]:
                continue
            o_km = float(other["chainage_km"])
            ahead_km = (o_km - t_km) if goods["direction"] == "DN" else (t_km - o_km)
            if 0.0 < ahead_km < dist_to_goods:
                gap_m = (ahead_km / max(30.0, float(other.get("speed_kmph") or 110.0))) * 60.0
                if head_gap_mins is None or gap_m < head_gap_mins:
                    head_gap_mins = gap_m

        res = evaluate_freight_probability(
            block=block,
            str_value=str_val,
            head_gap_mins=head_gap_mins,
            block_history=[],
            rain_mm_hr=self.rain_mm_hr,
            ulip_confirmed=False,
            stations=self.stations,
        )

        # If extreme monsoon raised threshold or edge kinematics slightly lowered posterior, re-evaluate sustained crawl
        if res.status != "PHANTOM_FREIGHT_SHADOW":
            sustained_actual = (blk_len / max(24.0, float(goods["speed_kmph"]) * 1.15)) * 60.0
            str_val = compute_str(sustained_actual, free_flow_mins)
            res = evaluate_freight_probability(
                block=block,
                str_value=str_val,
                head_gap_mins=head_gap_mins,
                block_history=[],
                rain_mm_hr=self.rain_mm_hr,
                ulip_confirmed=False,
                stations=self.stations,
            )

        goods["detected"] = True
        goods["detected_by_train"] = train_no
        goods["str_value"] = res.str_value
        goods["predicted_accuracy"] = res.freight_probability
        goods["predicted_status"] = res.status
        if res.clearance_station:
            goods["clearance_station"] = res.clearance_station

        base_speed = float(
            train_state.get("_cruise_override_speed")
            or (130.0 if train_state["priority_rank"] == 1 else 110.0)
        )
        dist_goods_rem = max(0.5, abs(float(goods["clearance_km"]) - float(goods["chainage_km"])))
        dist_train_rem = max(0.5, abs(float(goods["clearance_km"]) - t_km))
        freight_rem_mins = (dist_goods_rem / max(10.0, float(goods["speed_kmph"]))) * 60.0
        pass_ff_mins = (dist_train_rem / max(30.0, base_speed)) * 60.0
        rem_delay_mins = round(max(2.0, freight_rem_mins - pass_ff_mins), 1)

        # Now that prediction is complete, retroactively add the observation-window crawl loss
        obs_lost = float(slow_info.get("obs_lost_mins", 0.0))
        self._accrued_freight_delays[train_no] = (
            self._accrued_freight_delays.get(train_no, 0.0) + obs_lost
        )
        slow_info["obs_lost_mins"] = 0.0

        rem_in_blk = max(0.5, abs(blk_end - t_km))
        rem_frac = min(1.0, rem_in_blk / blk_len)
        scaled_block_penalty = round(rem_delay_mins / max(0.15, rem_frac), 1)

        total_added_delay = round(obs_lost + rem_delay_mins, 1)
        goods["predicted_delay_mins"] = total_added_delay
        goods["scaled_block_penalty"] = scaled_block_penalty

        acc_pct = int(round(res.freight_probability * 100))
        msg = (
            f"AI detected goods rake {goods['rake_id']} on {goods['block_id']} "
            f"({acc_pct}% accuracy, STR {res.str_value:.2f}) — clears at "
            f"{goods['clearance_station']} Loop (+{total_added_delay:.0f}m delay)"
        )

        self._injected_freights[goods["block_id"]] = scaled_block_penalty
        self._random_freight_blocks.add(goods["block_id"])
        self._detected_freight_meta[goods["block_id"]] = {
            "str_value": res.str_value,
            "freight_probability": res.freight_probability,
            "status": res.status,
            "clearance_station": goods["clearance_station"],
            "clearance_eta_mins": rem_delay_mins,
            "block_penalty_mins": scaled_block_penalty,
            "added_delay_mins": total_added_delay,
            "detected_by_train": train_no,
            "rake_id": goods["rake_id"],
            "human_message": msg,
        }

        train_state["status"] = "CRAWLING_FREIGHT_DRAG"
        train_state["delay_mins"] = self._compute_current_delay(train_no)

    async def advance_simulation(self, elapsed_wall_seconds: float) -> None:
        """Advances physical train positions by (elapsed_wall_seconds * speed_multiplier)."""
        sim_delta_secs = elapsed_wall_seconds * self.speed_multiplier
        self._sim_clock_exact += sim_delta_secs
        self.sim_clock_secs = int(self._sim_clock_exact)
        delta_hours = sim_delta_secs / 3600.0

        # Automatic turnaround cycle: when all active trains complete their runs,
        # dwell at terminus for 180 simulation seconds and reset smoothly
        if all(t.get("status") == "AT_TERMINUS" for t in self._trains.values()):
            self._all_terminated_secs = getattr(self, "_all_terminated_secs", 0.0) + sim_delta_secs
            if self._all_terminated_secs >= 180.0:
                self.reset_cycle()
            return
        else:
            self._all_terminated_secs = 0.0

        # Advance any active hidden random goods trains and clear when they enter loop
        for g in self._hidden_goods_trains:
            if g.get("cleared"):
                continue
            g_spd = float(g.get("speed_kmph", 28.0))
            if g["direction"] == "DN":
                g["chainage_km"] = round(min(float(g["clearance_km"]), float(g["chainage_km"]) + g_spd * delta_hours), 2)
                reached_loop = float(g["chainage_km"]) >= float(g["clearance_km"]) - 0.05
            else:
                g["chainage_km"] = round(max(float(g["clearance_km"]), float(g["chainage_km"]) - g_spd * delta_hours), 2)
                reached_loop = float(g["chainage_km"]) <= float(g["clearance_km"]) + 0.05
            if reached_loop:
                g["chainage_km"] = float(g["clearance_km"])
                g["cleared"] = True
                g["speed_kmph"] = 0.0
                self._injected_freights.pop(g["block_id"], None)
                self._detected_freight_meta.pop(g["block_id"], None)
                self._random_freight_blocks.discard(g["block_id"])

        random_active_blocks = {
            g["block_id"] for g in self._hidden_goods_trains if not g.get("cleared")
        }

        vande_km = self._trains.get("22895", {}).get("chainage_km", 0.0)
        stations_asc = sorted(self.stations, key=lambda s: float(s["chainage_km"]))
        stn_dict = {s["station_code"]: s for s in stations_asc}
        stn_km_by_code = {s["station_code"]: float(s["chainage_km"]) for s in stations_asc}

        block_lookup = {
            b["block_id"]: (
                b["direction"],
                min(float(b["start_km"]), float(b["end_km"])),
                max(float(b["start_km"]), float(b["end_km"])),
            )
            for b in self.topology.get("track_blocks", [])
        }
        fallback_bounds = {
            "DN_CTC_BRAG": ("DN", 115.0, 128.0),
            "UP_KUR_BBS": ("UP", 143.0, 162.0),
        }
        active_freight_zones: list[tuple[str, float, float]] = []
        if isinstance(self._injected_freights, dict):
            freight_iter = [
                (val.get("block_id", key) if isinstance(val, dict) else key, val)
                for key, val in self._injected_freights.items()
            ]
        else:
            freight_iter = [
                (item.get("block_id", "") if isinstance(item, dict) else str(item), item)
                for item in (self._injected_freights or [])
            ]
        for blk_id, val in freight_iter:
            if blk_id in random_active_blocks:
                continue
            bounds = block_lookup.get(blk_id) or fallback_bounds.get(blk_id)
            if bounds is not None:
                active_freight_zones.append(bounds)
            elif isinstance(val, dict) and "start_km" in val and "end_km" in val:
                active_freight_zones.append((
                    val.get("direction", "DN"),
                    min(float(val["start_km"]), float(val["end_km"])),
                    max(float(val["start_km"]), float(val["end_km"])),
                ))

        def _next_stn(direction: str, km: float) -> str | None:
            if not stations_asc:
                return None
            if direction == "DN":
                for s in stations_asc:
                    if float(s["chainage_km"]) > km + 0.1:
                        return s["station_code"]
                return stations_asc[-1]["station_code"]
            for s in reversed(stations_asc):
                if float(s["chainage_km"]) < km - 0.1:
                    return s["station_code"]
            return stations_asc[0]["station_code"]

        for t_no, t in self._trains.items():
            if t.get("status") == "AT_TERMINUS":
                t["speed_kmph"] = 0.0
                continue

            in_freight_zone = any(
                d == t["direction"] and lo <= t["chainage_km"] <= hi
                for d, lo, hi in active_freight_zones
            )
            # During active overtake at loop line, Vande Bharat overtakes on the clear mainline
            if (
                self._hold_until_overtaken
                and self._overtake_target_code
                and t_no == "22895"
            ):
                in_freight_zone = False
            base_speed = float(
                t.get("_cruise_override_speed") or (130.0 if t["priority_rank"] == 1 else 110.0)
            )
            base_status = "RUNNING_HIGH_SPEED" if t["priority_rank"] == 1 else "RUNNING_NORMAL"

            effective_delta_hours = delta_hours

            # Apply active timed disruption cause physics (stop or speed drop, then auto-resume)
            effects = self._active_cause_effects.get(t_no, [])
            cause_active = False
            if effects:
                cause_active = True
                eff = effects[0]
                eff_speed = float(eff["speed_kmph"])
                actual_speed = (
                    0.0
                    if eff_speed == 0.0
                    else (min(eff_speed, 29.0) if in_freight_zone else eff_speed)
                )
                loss_rate = max(0.05, 1.0 - (actual_speed / base_speed)) if base_speed > 0 else 1.0
                budget_used = min(
                    float(eff["remaining_delay_mins"]),
                    (sim_delta_secs / 60.0) * loss_rate,
                )
                eff["remaining_delay_mins"] = round(
                    float(eff["remaining_delay_mins"]) - budget_used, 4
                )
                self._accrued_cause_delays[t_no] = (
                    self._accrued_cause_delays.get(t_no, 0.0) + budget_used
                )
                t["delay_mins"] = self._compute_current_delay(t_no)

                if actual_speed == 0.0:
                    held_secs = budget_used * 60.0
                    effective_delta_hours = max(0.0, sim_delta_secs - held_secs) / 3600.0

                if eff["remaining_delay_mins"] <= 0.01:
                    effects.pop(0)
                    if effects:
                        nxt = effects[0]
                        nxt_spd = float(nxt["speed_kmph"])
                        t["speed_kmph"] = (
                            0.0
                            if nxt_spd == 0.0
                            else (min(nxt_spd, 29.0) if in_freight_zone else nxt_spd)
                        )
                        t["status"] = (
                            "CRAWLING_FREIGHT_DRAG"
                            if (in_freight_zone and nxt_spd > 29.0)
                            else str(nxt["status"])
                        )
                        if t["speed_kmph"] == 0.0:
                            continue
                    else:
                        cause_active = False
                        t["speed_kmph"] = 29.0 if in_freight_zone else base_speed
                        t["status"] = "CRAWLING_FREIGHT_DRAG" if in_freight_zone else base_status
                        if eff["status"] in ("PLATFORM_HOLD", "OHE_BRAKE_HOLD"):
                            t["current_station"] = None
                else:
                    t["speed_kmph"] = actual_speed
                    t["status"] = (
                        "CRAWLING_FREIGHT_DRAG"
                        if (in_freight_zone and actual_speed == 29.0 and eff_speed > 29.0)
                        else str(eff["status"])
                    )
                    if actual_speed == 0.0:
                        continue

            # Check proximity to any uncleared random goods train ahead on this track
            def _find_blocking_goods(direction: str, km: float) -> dict[str, Any] | None:
                for g in self._hidden_goods_trains:
                    if g.get("cleared") or g["direction"] != direction:
                        continue
                    gap = (float(g["chainage_km"]) - km) if direction == "DN" else (km - float(g["chainage_km"]))
                    if -0.5 <= gap <= 3.0:
                        return g
                return None

            blocking_goods = _find_blocking_goods(t["direction"], float(t["chainage_km"]))
            # During active overtake at Barang, Khurda Road, Bhubaneswar, Mecheda, or Santragachi, Vande Bharat overtakes on the clear mainline
            if (
                self._hold_until_overtaken
                and self._overtake_target_code in ("BRAG", "KUR", "BBS", "MCA", "SRC")
                and t_no == "22895"
            ):
                blocking_goods = None

            # Enforce physical speed drop inside any active goods train block area
            if not cause_active:
                if blocking_goods is not None and t["status"] != "AT_STATION_HALT":
                    g_spd = min(base_speed, float(blocking_goods.get("speed_kmph", 28.0)))
                    t["speed_kmph"] = g_spd
                    slow_info = blocking_goods["slowed_trains"].setdefault(
                        t_no,
                        {
                            "slowdown_start_km": float(t["chainage_km"]),
                            "crawl_secs": 0.0,
                            "obs_lost_mins": 0.0,
                        },
                    )
                    slow_info["crawl_secs"] += sim_delta_secs
                    if not blocking_goods["detected"]:
                        t["status"] = "UNSCHEDULED_SLOWDOWN"
                        slow_info["obs_lost_mins"] += (sim_delta_secs / 60.0) * max(
                            0.0, 1.0 - (g_spd / base_speed)
                        )
                        if slow_info["crawl_secs"] >= 12.0:
                            self._evaluate_hidden_goods_detection(blocking_goods, t_no, t, slow_info)
                    else:
                        t["status"] = "CRAWLING_FREIGHT_DRAG"
                        freight_lost = (sim_delta_secs / 60.0) * max(0.0, 1.0 - (g_spd / base_speed))
                        self._accrued_freight_delays[t_no] = (
                            self._accrued_freight_delays.get(t_no, 0.0) + freight_lost
                        )
                        t["delay_mins"] = self._compute_current_delay(t_no)
                elif in_freight_zone and t["status"] != "AT_STATION_HALT":
                    t["status"] = "CRAWLING_FREIGHT_DRAG"
                    t["speed_kmph"] = 29.0
                    freight_lost = (sim_delta_secs / 60.0) * max(0.0, 1.0 - (29.0 / base_speed))
                    self._accrued_freight_delays[t_no] = (
                        self._accrued_freight_delays.get(t_no, 0.0) + freight_lost
                    )
                    t["delay_mins"] = self._compute_current_delay(t_no)
                elif not in_freight_zone and t["status"] in (
                    "CRAWLING_FREIGHT_DRAG",
                    "UNSCHEDULED_SLOWDOWN",
                    "TSR_CAUTION",
                    "SIGNAL_CONGESTION",
                    "WEATHER_CAUTION",
                    "PLATFORM_HOLD",
                    "OHE_BRAKE_HOLD",
                ):
                    t["status"] = base_status
                    t["speed_kmph"] = base_speed

            # Gap-gated overtake: 12821 only slows/stops at loop when 22895 is within 18 km
            if self._hold_until_overtaken and t_no == "12821":
                target_km = self._overtake_target_km
                target_code = self._overtake_target_code
                hold_elapsed = float(t.get("_overtake_hold_secs", 0.0))
                can_release = (vande_km >= target_km + 3.0) and (
                    hold_elapsed >= self._overtake_min_hold_secs
                    or self._overtake_min_hold_secs <= 0.0
                )
                if can_release:
                    self._hold_until_overtaken = False
                    t.pop("_overtake_hold_secs", None)
                    if not cause_active:
                        t["status"] = "CRAWLING_FREIGHT_DRAG" if in_freight_zone else "RUNNING_NORMAL"
                        t["speed_kmph"] = 29.0 if in_freight_zone else 110.0
                    t["current_station"] = None
                    t["next_station"] = _next_stn("DN", t["chainage_km"])
                    if "22895" in self._trains:
                        self._trains["22895"].pop("_cruise_override_speed", None)
                        if (
                            not self._active_cause_effects.get("22895")
                            and self._trains["22895"]["status"] != "CRAWLING_FREIGHT_DRAG"
                        ):
                            self._trains["22895"]["speed_kmph"] = 130.0
                elif (
                    t["status"] == "AT_STATION_HALT"
                    and t.get("current_station") == target_code
                    and t["chainage_km"] >= target_km
                ) or (0.0 <= (target_km - vande_km) <= 18.0):
                    if t["chainage_km"] >= target_km:
                        t["chainage_km"] = target_km
                        t["status"] = "AT_STATION_HALT"
                        t["current_station"] = target_code
                        t["speed_kmph"] = 0.0
                        t["_overtake_hold_secs"] = hold_elapsed + sim_delta_secs
                        self._accrued_loop_delays[t_no] = (
                            self._accrued_loop_delays.get(t_no, 0.0) + (sim_delta_secs / 60.0)
                        )
                        t["delay_mins"] = self._compute_current_delay(t_no)
                        continue
                    if not in_freight_zone and not cause_active:
                        t["speed_kmph"] = 45.0 if (target_km - t["chainage_km"]) < 3.0 else 55.0
                        t["status"] = "RUNNING_NORMAL"
                    t["current_station"] = None
                    t["next_station"] = target_code
                    new_km = min(target_km, t["chainage_km"] + t["speed_kmph"] * delta_hours)
                    t["chainage_km"] = round(new_km, 2)
                    if t["chainage_km"] >= target_km:
                        t["status"] = "AT_STATION_HALT"
                        t["current_station"] = target_code
                        t["speed_kmph"] = 0.0
                        t["_overtake_hold_secs"] = 0.0
                    continue
                elif t["status"] != "AT_STATION_HALT":
                    # 22895 is still > 18 km away: keep 12821 at its normal speed and advance loop target if passed
                    if t["chainage_km"] >= target_km:
                        next_loop = next(
                            (s for s in stations_asc if float(s["chainage_km"]) > t["chainage_km"] + 0.8 and s.get("passenger_loops_dn", 0) > 0),
                            None,
                        )
                        if next_loop is not None:
                            self._overtake_target_km = float(next_loop["chainage_km"])
                            self._overtake_target_code = next_loop["station_code"]
                        else:
                            self._hold_until_overtaken = False
                    if not in_freight_zone and not cause_active:
                        t["status"] = "RUNNING_NORMAL"
                        t["speed_kmph"] = 110.0
                        t["current_station"] = None

            # If train is halted at a commercial station, dwell for its scheduled duration
            if t["status"] == "AT_STATION_HALT":
                t["_halt_elapsed_secs"] = t.get("_halt_elapsed_secs", 0.0) + sim_delta_secs
                halt_target = float(t.get("_halt_target_secs", 120.0))
                if t["_halt_elapsed_secs"] >= halt_target:
                    t.pop("_halt_elapsed_secs", None)
                    t.pop("_halt_target_secs", None)
                    t["status"] = "CRAWLING_FREIGHT_DRAG" if in_freight_zone else base_status
                    t["speed_kmph"] = 29.0 if in_freight_zone else base_speed
                    t["current_station"] = None
                    t["next_station"] = _next_stn(t["direction"], t["chainage_km"])
                continue

            corridor_end_km = float(self.stations[-1]["chainage_km"]) if self.stations else 206.0
            dn_terminus_code = self.stations[-1]["station_code"] if self.stations else "PURI"
            up_terminus_code = self.stations[0]["station_code"] if self.stations else "BHC"

            old_km = float(t["chainage_km"])
            dist_moved = t["speed_kmph"] * effective_delta_hours
            if t["direction"] == "DN":
                new_km = min(corridor_end_km, old_km + dist_moved)
                for g in self._hidden_goods_trains:
                    if g.get("cleared") or g["direction"] != "DN":
                        continue
                    g_km = float(g["chainage_km"])
                    if old_km <= g_km and new_km >= g_km - 2.5:
                        new_km = min(new_km, max(old_km, g_km - 0.6))
                        if not cause_active and t["status"] != "AT_STATION_HALT":
                            g_spd = min(base_speed, float(g.get("speed_kmph", 28.0)))
                            t["speed_kmph"] = g_spd
                            t["status"] = "CRAWLING_FREIGHT_DRAG" if g["detected"] else "UNSCHEDULED_SLOWDOWN"
                            g["slowed_trains"].setdefault(
                                t_no,
                                {"slowdown_start_km": round(new_km, 2), "crawl_secs": 0.0, "obs_lost_mins": 0.0},
                            )
                t["chainage_km"] = round(new_km, 2)
                if new_km >= corridor_end_km:
                    t["chainage_km"] = corridor_end_km
                    t["speed_kmph"] = 0.0
                    t["status"] = "AT_TERMINUS"
                    t["current_station"] = dn_terminus_code
                    t["next_station"] = None
                else:
                    nxt_code = t.get("next_station")
                    halted = False
                    if nxt_code and nxt_code in stn_dict:
                        nxt_stn = stn_dict[nxt_code]
                        s_km = float(nxt_stn["chainage_km"])
                        if old_km < s_km <= new_km or abs(new_km - s_km) <= 0.15:
                            dwell_secs = self._commercial_dwell_secs(t_no, nxt_stn)
                            if dwell_secs > 0:
                                t["chainage_km"] = round(s_km, 2)
                                t["status"] = "AT_STATION_HALT"
                                t["current_station"] = nxt_code
                                t["speed_kmph"] = 0.0
                                t["_halt_target_secs"] = dwell_secs
                                t["_halt_elapsed_secs"] = 0.0
                                halted = True
                    if not halted and (not nxt_code or new_km >= stn_km_by_code.get(nxt_code, -1.0)):
                        t["next_station"] = _next_stn("DN", new_km)
            else:
                new_km = max(0.0, old_km - dist_moved)
                for g in self._hidden_goods_trains:
                    if g.get("cleared") or g["direction"] != "UP":
                        continue
                    g_km = float(g["chainage_km"])
                    if old_km >= g_km and new_km <= g_km + 2.5:
                        new_km = max(new_km, min(old_km, g_km + 0.6))
                        if not cause_active and t["status"] != "AT_STATION_HALT":
                            g_spd = min(base_speed, float(g.get("speed_kmph", 28.0)))
                            t["speed_kmph"] = g_spd
                            t["status"] = "CRAWLING_FREIGHT_DRAG" if g["detected"] else "UNSCHEDULED_SLOWDOWN"
                            g["slowed_trains"].setdefault(
                                t_no,
                                {"slowdown_start_km": round(new_km, 2), "crawl_secs": 0.0, "obs_lost_mins": 0.0},
                            )
                t["chainage_km"] = round(new_km, 2)
                if new_km <= 0.0:
                    t["chainage_km"] = 0.0
                    t["speed_kmph"] = 0.0
                    t["status"] = "AT_TERMINUS"
                    t["current_station"] = up_terminus_code
                    t["next_station"] = None
                else:
                    nxt_code = t.get("next_station")
                    halted = False
                    if nxt_code and nxt_code in stn_dict:
                        nxt_stn = stn_dict[nxt_code]
                        s_km = float(nxt_stn["chainage_km"])
                        if new_km <= s_km < old_km or abs(new_km - s_km) <= 0.15:
                            dwell_secs = self._commercial_dwell_secs(t_no, nxt_stn)
                            if dwell_secs > 0:
                                t["chainage_km"] = round(s_km, 2)
                                t["status"] = "AT_STATION_HALT"
                                t["current_station"] = nxt_code
                                t["speed_kmph"] = 0.0
                                t["_halt_target_secs"] = dwell_secs
                                t["_halt_elapsed_secs"] = 0.0
                                halted = True
                    if not halted and (not nxt_code or new_km <= stn_km_by_code.get(nxt_code, 999.0)):
                        t["next_station"] = _next_stn("UP", new_km)

            # Immediately exit freight crawl status/speed once train crosses clear of the block
            still_in_freight = any(
                d == t["direction"] and lo <= t["chainage_km"] <= hi
                for d, lo, hi in active_freight_zones
            )
            still_behind_goods = _find_blocking_goods(t["direction"], float(t["chainage_km"])) is not None
            if (
                not cause_active
                and not still_in_freight
                and not still_behind_goods
                and t["status"] in ("CRAWLING_FREIGHT_DRAG", "UNSCHEDULED_SLOWDOWN")
            ):
                t["status"] = base_status
                t["speed_kmph"] = base_speed

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

        freight_shadows = []
        for block_id, penalty_mins in self._injected_freights.items():
            direction = "UP" if block_id.startswith("UP_") else "DN"
            clearance_stn = block_id.split("_")[-1] if "_" in block_id else "BRAG"
            meta = self._detected_freight_meta.get(block_id)
            if meta:
                freight_shadows.append(
                    FreightInferenceResult(
                        block_id=block_id,
                        direction=direction,
                        str_value=float(meta["str_value"]),
                        freight_probability=float(meta["freight_probability"]),
                        status=meta["status"],
                        clearance_station=meta.get("clearance_station") or clearance_stn,
                        clearance_eta_mins=float(meta["clearance_eta_mins"]),
                        block_penalty_mins=float(meta["block_penalty_mins"]),
                        added_delay_mins=float(meta["added_delay_mins"]),
                        detected_by_train=meta.get("detected_by_train"),
                        rake_id=meta.get("rake_id"),
                        human_message=meta.get("human_message"),
                    )
                )
            else:
                freight_shadows.append(
                    FreightInferenceResult(
                        block_id=block_id,
                        direction=direction,
                        str_value=1.85,
                        freight_probability=0.88,
                        status="PHANTOM_FREIGHT_SHADOW",
                        clearance_station=clearance_stn,
                        clearance_eta_mins=float(penalty_mins),
                    )
                )

        return {
            "tick_utc": self.sim_clock_secs,
            "mode": f"DEMO_{int(self.speed_multiplier)}X",
            "speed_multiplier": self.speed_multiplier,
            "trains": train_states,
            "phantom_freights": freight_shadows,
            "goods_rakes": self.get_goods_rakes_snapshot(),
            "weather": {
                "rain_mm_hr": self.rain_mm_hr,
                "wind_speed_kmph": 24.0 if self.rain_mm_hr > 10.0 else 14.0,
                "condition": self.weather_condition,
            },
        }

    async def set_speed_multiplier(self, multiplier: float) -> None:
        self.speed_multiplier = max(0.5, min(60.0, multiplier))

    async def inject_delay(self, train_no: str, additional_mins: float) -> None:
        if train_no in self._trains:
            self._manual_delays[train_no] = self._manual_delays.get(train_no, 0.0) + additional_mins
            self._trains[train_no]["delay_mins"] += additional_mins

    async def apply_causes(
        self,
        train_no: str,
        causes: list[str],
        direct_delay_mins: float,
        freight_penalty_mins: float,
        rain_mm_hr: float,
    ) -> float:
        unique_causes = list(dict.fromkeys(causes))
        self._active_causes[train_no] = unique_causes
        if train_no in self._trains:
            t = self._trains[train_no]
            base_speed = float(
                t.get("_cruise_override_speed") or (130.0 if t["priority_rank"] == 1 else 110.0)
            )
            base_status = "RUNNING_HIGH_SPEED" if t["priority_rank"] == 1 else "RUNNING_NORMAL"

            # Preserve remaining time for causes still active; enqueue newly added timed causes
            existing_map = {
                e["cause_id"]: e for e in self._active_cause_effects.get(train_no, [])
            }
            next_effects: list[dict[str, Any]] = []
            for cid in unique_causes:
                if cid in existing_map:
                    next_effects.append(existing_map[cid])
                elif cid in self.CAUSE_PHYSICS:
                    spec = DISRUPTION_CAUSE_CATALOG.get(cid, {})
                    phys = self.CAUSE_PHYSICS[cid]
                    spd = (
                        float(phys["speed_kmph"])
                        if "speed_kmph" in phys
                        else round(base_speed * float(phys["speed_factor"]), 1)
                    )
                    next_effects.append({
                        "cause_id": cid,
                        "remaining_delay_mins": float(spec.get("added_delay_mins", 10.0)),
                        "speed_kmph": spd,
                        "status": str(phys["status"]),
                    })

            if not unique_causes:
                self._accrued_cause_delays[train_no] = 0.0
            self._active_cause_effects[train_no] = next_effects

            if not next_effects and direct_delay_mins > 0:
                self._manual_delays[train_no] = self._manual_delays.get(train_no, 0.0) + direct_delay_mins
            t["delay_mins"] = self._compute_current_delay(train_no)

            direction = t["direction"]
            km = float(t["chainage_km"])
            if freight_penalty_mins > 0:
                track_blocks = self.topology.get("track_blocks", [])
                if direction == "DN":
                    if any(b.get("block_id") == "DN_CTC_BRAG" for b in track_blocks):
                        block_id = "DN_CTC_BRAG"
                        if km > 128.0:
                            ahead = [
                                b for b in track_blocks
                                if b["direction"] == "DN" and max(float(b["start_km"]), float(b["end_km"])) > km
                            ]
                            if ahead:
                                block_id = ahead[0]["block_id"]
                    else:
                        ahead = [
                            b for b in track_blocks
                            if b["direction"] == "DN" and max(float(b["start_km"]), float(b["end_km"])) > km
                        ]
                        block_id = ahead[0]["block_id"] if ahead else (track_blocks[0]["block_id"] if track_blocks else "DN_BLOCK_1")
                else:
                    if any(b.get("block_id") == "UP_KUR_BBS" for b in track_blocks):
                        block_id = "UP_KUR_BBS"
                        if km < 143.0:
                            ahead = [
                                b for b in track_blocks
                                if b["direction"] == "UP" and min(float(b["start_km"]), float(b["end_km"])) < km
                            ]
                            if ahead:
                                block_id = ahead[0]["block_id"]
                    else:
                        ahead = [
                            b for b in track_blocks
                            if b["direction"] == "UP" and min(float(b["start_km"]), float(b["end_km"])) < km
                        ]
                        block_id = ahead[0]["block_id"] if ahead else (track_blocks[-1]["block_id"] if track_blocks else "UP_BLOCK_1")
                prev_blk = self._freight_cause_blocks.get(train_no)
                if prev_blk and prev_blk != block_id and prev_blk not in (
                    v for k, v in self._freight_cause_blocks.items() if k != train_no
                ):
                    self._injected_freights.pop(prev_blk, None)
                self._freight_cause_blocks[train_no] = block_id
                self._injected_freights[block_id] = freight_penalty_mins
            else:
                prev_blk = self._freight_cause_blocks.pop(train_no, None)
                if prev_blk and prev_blk not in self._freight_cause_blocks.values():
                    self._injected_freights.pop(prev_blk, None)

            # Immediately reflect active cause's physical slow/stop state on the train
            if next_effects:
                head = next_effects[0]
                t["speed_kmph"] = float(head["speed_kmph"])
                t["status"] = str(head["status"])
            elif t["status"] in (
                "TSR_CAUTION",
                "SIGNAL_CONGESTION",
                "WEATHER_CAUTION",
                "PLATFORM_HOLD",
                "OHE_BRAKE_HOLD",
            ):
                t["speed_kmph"] = base_speed
                t["status"] = base_status

        # Update weather dynamically based on active monsoon rain causes across all trains
        active_rain = max(
            [rain_mm_hr]
            + [28.0 for c_list in self._active_causes.values() if "MONSOON_RAIN" in c_list],
            default=0.0,
        )
        self.rain_mm_hr = active_rain
        self.weather_condition = (
            "HEAVY_MONSOON"
            if self.rain_mm_hr > 10.0
            else ("OVERCAST" if self.rain_mm_hr > 0.0 else "CLEAR")
        )
        return self._trains[train_no]["delay_mins"] if train_no in self._trains else direct_delay_mins

    async def inject_freight(self, block_id: str, confidence: float, duration_mins: float) -> None:
        self._injected_freights[block_id] = duration_mins

    async def trigger_live_overtake(self) -> dict[str, Any]:
        """
        Triggers a priority overtake in-place WITHOUT resetting/teleporting train positions:
        slows 12821 into the next upcoming loop station and boosts 22895 Vande Bharat.
        """
        dhauli = self._trains.get("12821")
        vande = self._trains.get("22895")
        if not dhauli or not vande:
            return {"status": "UNAVAILABLE"}

        d_km = float(dhauli["chainage_km"])
        v_km = float(vande["chainage_km"])

        dn_loops = sorted(
            (s for s in self.stations if s["chainage_km"] >= d_km and s.get("passenger_loops_dn", 0) > 0),
            key=lambda s: s["chainage_km"],
        )
        target_stn = dn_loops[0] if dn_loops else self.stations[-1]
        self._overtake_target_km = float(target_stn["chainage_km"])
        self._overtake_target_code = str(target_stn["station_code"])
        self._hold_until_overtaken = True

        # Slow Dhauli smoothly only if Vande Bharat is within 18 km of target loop
        dhauli["next_station"] = self._overtake_target_code
        if 0.0 <= (self._overtake_target_km - v_km) <= 18.0:
            if d_km >= self._overtake_target_km:
                dhauli["speed_kmph"] = 0.0
                dhauli["status"] = "AT_STATION_HALT"
                dhauli["current_station"] = self._overtake_target_code
            else:
                dhauli["speed_kmph"] = 50.0
                dhauli["status"] = "RUNNING_NORMAL"
                dhauli["current_station"] = None
        else:
            dhauli["speed_kmph"] = 110.0
            dhauli["status"] = "RUNNING_NORMAL"
            dhauli["current_station"] = None

        cur_d = self._compute_current_delay("12821")
        if cur_d < 16.0:
            self._manual_delays["12821"] = self._manual_delays.get("12821", 0.0) + (16.0 - cur_d)
        dhauli["delay_mins"] = self._compute_current_delay("12821")

        # Boost trailing Vande Bharat from its current live position (zero coordinate jump)
        vande["_cruise_override_speed"] = 180.0
        if not self._active_cause_effects.get("22895") and vande["status"] != "CRAWLING_FREIGHT_DRAG":
            vande["speed_kmph"] = 180.0
            vande["status"] = "RUNNING_HIGH_SPEED"

        return {
            "status": "OVERTAKE_TRIGGERED",
            "hold_station_code": self._overtake_target_code,
            "hold_station_name": target_stn["station_name"],
            "hold_km": self._overtake_target_km,
            "dhauli_km": d_km,
            "vande_km": v_km,
        }

    async def tick(self) -> dict[str, Any]:
        """Convenience alias for get_corridor_snapshot."""
        return await self.get_corridor_snapshot()

    def switch_corridor(self, corridor_id: str, speed_multiplier: float = 1.0) -> None:
        """Dynamically switches active corridor, topology and resets trains for simulation."""
        self.corridor_id = corridor_id
        self.topology = LocalTopologyFallback.load_topology(corridor_id=corridor_id)
        self.stations = self.topology["stations"]
        self.speed_multiplier = speed_multiplier
        scenario_name = "KOLKATA_CASCADE" if corridor_id == "SER_HWH_KGP" else "DHAULI_CASCADE"
        self.__init__(
            speed_multiplier=speed_multiplier,
            scenario_mode=self.scenario_mode,
            scenario_name=scenario_name,
            corridor_id=corridor_id,
        )

