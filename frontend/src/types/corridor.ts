type Direction = 'DN' | 'UP';

interface CausalCard {
  event: string;
  station_code: string;
  station_name: string;
  added_delay_mins: number;
  caused_by_train?: string | null;
  human_message: string;
}

interface StationArrival {
  station_code: string;
  station_name: string;
  chainage_km: number;
  sched_arr_epoch: number;
  sched_dep_epoch: number;
  projected_arr_epoch: number;
  projected_dep_epoch: number;
  raw_sim_delay_mins: number;
  net_delay_mins: number;
  is_commercial_halt: boolean;
  causal_cards: CausalCard[];
}

export interface TrainKinematicState {
  train_no: string;
  train_name: string;
  direction: Direction;
  priority_rank: number;
  chainage_km: number;
  lat?: number | null;
  lon?: number | null;
  speed_kmph: number;
  current_delay_mins: number;
  current_station?: string | null;
  next_station?: string | null;
  last_updated_epoch: number;
  status: string;
}

interface FreightInferenceResult {
  block_id: string;
  direction: Direction;
  str_value: number;
  freight_probability: number;
  status:
    | 'NORMAL_SPEED'
    | 'COACHING_CONGESTION'
    | 'STATIC_TSR_OR_SIGNAL_FAULT'
    | 'PHANTOM_FREIGHT_SHADOW'
    | 'ULIP_FOIS_CONFIRMED';
  clearance_station?: string | null;
  clearance_eta_mins?: number | null;
  detected_by_train?: string | null;
  rake_id?: string | null;
  human_message?: string | null;
  block_penalty_mins?: number | null;
  added_delay_mins?: number | null;
}

interface GoodsRakeTelemetry {
  rake_id: string;
  block_id: string;
  from_station: string;
  to_station: string;
  direction: Direction;
  chainage_km: number;
  speed_kmph: number;
  clearance_station: string;
  detected: boolean;
  detected_by_train?: string | null;
  str_value?: number | null;
  predicted_accuracy?: number | null;
  predicted_delay_mins: number;
  cleared: boolean;
  status_phase:
    | 'HIDDEN_ON_TRACK'
    | 'SLOWDOWN_ANALYZING'
    | 'PREDICTED_DELAY_ADDED'
    | 'CLEARED_TO_LOOP';
}

interface WeatherData {
  rain_mm_hr: number;
  wind_speed_kmph: number;
  condition: string;
}

export interface CorridorSnapshot {
  corridor_id?: string;
  tick_utc: number;
  mode: string;
  speed_multiplier: number;
  trains: TrainKinematicState[];
  phantom_freights: FreightInferenceResult[];
  goods_rakes?: GoodsRakeTelemetry[];
  weather: WeatherData;
}

export interface ForecastResponse {
  train_no: string;
  train_name: string;
  direction: Direction;
  current_chainage_km: number;
  current_delay_mins: number;
  naive_ntes_eta_epoch: number;
  naive_ntes_delay_mins: number;
  p10_eta_epoch: number;
  p50_eta_epoch: number;
  p90_eta_epoch: number;
  p10_delay_mins: number;
  p50_delay_mins: number;
  p90_delay_mins: number;
  usable_slack_mins: number;
  station_timeline: StationArrival[];
  causal_cards: CausalCard[];
  overtakes_count: number;
}

interface BailoutPlan {
  deboard_station_code: string;
  deboard_station_name: string;
  deboard_eta_epoch: number;
  road_mode: string;
  station_exit_mins: number;
  road_drive_mins: number;
  final_road_arrival_epoch: number;
  minutes_saved: number;
  road_survival_pct: number;
  polyline: string;
  human_guidance: string;
  destination_station_code?: string;
  destination_station_name?: string;
  road_distance_km?: number;
  highway_name?: string;
}

export interface RescueEvaluationResponse {
  passenger_status: 'PRE_BOARDING' | 'ON_BOARD';
  survival_probability_pct: number;
  risk_level: 'SAFE' | 'WATCH' | 'HIGH_RISK_MISS';
  safe_boarding_lock: boolean;
  boarding_advisory?: string;
  train_p10_eta_epoch?: number;
  train_p50_eta_epoch?: number;
  train_p90_eta_epoch?: number;
  bailout_recommended: boolean;
  bailout_plan?: BailoutPlan | null;
  disclaimer: string;
}
