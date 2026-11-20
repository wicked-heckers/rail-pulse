from typing import Any, Literal
from pydantic import BaseModel, Field


class StationSchema(BaseModel):
    station_code: str
    station_name: str
    chainage_km: float
    lat: float
    lon: float
    has_750m_goods_loop: bool = False
    passenger_loops_dn: int = 1
    passenger_loops_up: int = 1
    is_major_junction: bool = False
    road_exit_penalty_m: int = 12


class TrackBlockSchema(BaseModel):
    block_id: str
    direction: Literal["DN", "UP"]
    from_station: str
    to_station: str
    start_km: float
    end_km: float
    length_km: float
    mps_kmph: int = 110
    free_flow_mins: float
    freight_injection_weight: float = 0.15
    terminal_slack_mins: float = 0.0


class TrainHaltSchema(BaseModel):
    station_code: str
    stop_sequence: int
    day_offset: int = 0
    sched_arr_min_day: int
    sched_dep_min_day: int
    is_commercial_halt: bool = True
    scheduled_dwell_m: int = 2


class TrainMasterSchema(BaseModel):
    train_no: str
    train_name: str
    train_class: str
    priority_rank: int
    direction: Literal["DN", "UP"]
    max_speed_kmph: int = 110
    halts: list[TrainHaltSchema] = Field(default_factory=list)


class TrainKinematicState(BaseModel):
    train_no: str
    train_name: str
    direction: Literal["DN", "UP"]
    priority_rank: int = 3
    chainage_km: float
    lat: float | None = None
    lon: float | None = None
    speed_kmph: float = 0.0
    current_delay_mins: float = 0.0
    current_station: str | None = None
    next_station: str | None = None
    last_updated_epoch: int = 0
    status: str = "RUNNING_NORMAL"


class HeadwayInfo(BaseModel):
    train_no: str
    direction: Literal["DN", "UP"]
    preceding_train_no: str | None = None
    preceding_gap_km: float | None = None
    preceding_gap_mins: float | None = None
    trailing_train_no: str | None = None
    trailing_gap_km: float | None = None
    trailing_gap_mins: float | None = None


class FreightInferenceResult(BaseModel):
    block_id: str
    direction: Literal["DN", "UP"]
    str_value: float
    freight_probability: float
    status: Literal[
        "NORMAL_SPEED",
        "COACHING_CONGESTION",
        "STATIC_TSR_OR_SIGNAL_FAULT",
        "PHANTOM_FREIGHT_SHADOW",
        "ULIP_FOIS_CONFIRMED"
    ]
    clearance_station: str | None = None
    clearance_eta_mins: float | None = None


class CausalCard(BaseModel):
    event: str
    station_code: str
    station_name: str
    added_delay_mins: float
    caused_by_train: str | None = None
    human_message: str


class StationArrival(BaseModel):
    station_code: str
    station_name: str
    chainage_km: float
    sched_arr_epoch: int
    sched_dep_epoch: int
    projected_arr_epoch: int
    projected_dep_epoch: int
    raw_sim_delay_mins: float
    net_delay_mins: float
    is_commercial_halt: bool = True
    causal_cards: list[CausalCard] = Field(default_factory=list)


class SimulationResult(BaseModel):
    train_no: str
    direction: Literal["DN", "UP"]
    timeline: list[StationArrival]
    overtakes_count: int = 0
    total_loop_hold_mins: float = 0.0
    causal_cards: list[CausalCard] = Field(default_factory=list)


class QuantileFeatureVector(BaseModel):
    current_delay_mins: float
    p50_base_delay_mins: float
    freight_probability: float = 0.0
    overtake_count: int = 0
    overtake_mins: float = 0.0
    remaining_km: float = 0.0
    remaining_halts: int = 0
    usable_slack_mins: float = 0.0
    rain_mm_hr: float = 0.0
    hour_of_day: int = 12
    junction_congestion_idx: float = 0.0


class QuantileResult(BaseModel):
    p10_delay_mins: float
    p50_delay_mins: float
    p90_delay_mins: float
    p10_eta_epoch: int
    p50_eta_epoch: int
    p90_eta_epoch: int
    min_spread_applied: float = 0.0


# --- API Request & Response Contracts ---

class RescueEvaluateRequest(BaseModel):
    train_no: str
    destination_code: str
    connection_deadline_utc: int
    transfer_buffer_mins: int = 15
    passenger_status: Literal["PRE_BOARDING", "ON_BOARD"] = "ON_BOARD"


class ULIPTelemetryPayload(BaseModel):
    rake_id: str
    block_id: str
    direction: Literal["DN", "UP"]
    speed_kmph: float = 35.0
    origin: str | None = None
    destination: str | None = None
    cargo_type: str = "COAL"
    timestamp_epoch: int | None = None


class DemoScenarioStartRequest(BaseModel):
    scenario_name: str = "DHAULI_CASCADE"
    speed_multiplier: int = 1


class DemoDelayInjectRequest(BaseModel):
    train_no: str
    added_delay_mins: float


class DemoSpeedRequest(BaseModel):
    speed_multiplier: int = 1


class ForecastResponse(BaseModel):
    train_no: str
    train_name: str
    direction: Literal["DN", "UP"]
    current_chainage_km: float
    current_delay_mins: float
    naive_ntes_eta_epoch: int
    naive_ntes_delay_mins: float
    p10_eta_epoch: int
    p50_eta_epoch: int
    p90_eta_epoch: int
    p10_delay_mins: float
    p50_delay_mins: float
    p90_delay_mins: float
    usable_slack_mins: float
    station_timeline: list[StationArrival]
    causal_cards: list[CausalCard]
    overtakes_count: int = 0


class HealthResponse(BaseModel):
    status: str
    environment: str
    database: str
    redis: str
    active_provider: str
    ml_models_loaded: bool
    active_trains_count: int
    timestamp_epoch: int

