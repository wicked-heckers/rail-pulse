1. Core Architectural Blueprint (Zero-Lag Modular Monolith)
Build the RAIL-PULSE backend as a single asynchronous FastAPI Modular Monolith backed by PostgreSQL + PostGIS, Redis, and a local JSON/SQLite resilience fallback. Avoid splitting this into microservices—inter-service HTTP overhead will burn debugging time and push latency above your <40 ms inference target.
Four Non-Negotiable Engineering Decisions
1D Chainage Scalar Physics Over 2D GIS Math: Never run PostGIS ST_Distance or ST_LineLocatePoint inside your simulation tick loop. Pre-project every station, block boundary, and 750m loop onto a 1D linear kilometer chainage axis (0.0 km at Bhadrak  ~310 km at Palasa, with a branch chainage for Khurda Road  Puri). Use PostGIS at startup/API boundaries for GeoJSON geometry rendering, and execute all overtake/freight physics in pure scalar float math inside RAM.
In-Process State Mirror + Redis Snapshot Cache: A single background asyncio worker polls external train feeds every 120 seconds and writes the normalized corridor snapshot to Redis, while mirroring the latest computed state into an in-memory dictionary (CorridorStateStore). Every REST read and WebSocket broadcast hits RAM/Redis in <5 ms, completely eliminating database lock contention and external API rate-limit bans.
Dead-Reckoning WebSocket Broadcasts: Never push 30 FPS position frames from the backend. Broadcast train kinematic state vectors (chainage_km, speed_kmph, acceleration, timestamp_utc, status_flags) once every 1–2 seconds (or on state change) and let MapLibre GL interpolate smooth 60 FPS motion on the client.
Strategy Pattern for Data Sources: Abstract ingestion behind a single CorridorDataProvider interface so you can hot-swap between LiveFeedProvider, DemoSimulationProvider (deterministic time-warped scenario for judges), and ULIPFoisEnterpriseProvider (webhook ingestion) with zero changes to downstream engines.
2. Production Repository Structure



Plaintext
rail-pulse-backend/
├── app/
│   ├── main.py                     # FastAPI lifespan (DB/Redis pools, ML load, background poller)
│   ├── config.py                   # Pydantic Settings (env vars, thresholds, corridor bounds)
│   ├── core/
│   │   ├── database.py             # Async SQLAlchemy (asyncpg) + SQLite fallback engine
│   │   ├── redis_client.py         # redis.asyncio pool + circuit breaker wrapper
│   │   └── state_store.py          # Thread/async-safe in-memory CorridorStateStore
│   ├── models/
│   │   ├── db_models.py            # SQLAlchemy + GeoAlchemy2 PostGIS ORM models
│   │   └── schemas.py              # Strict Pydantic v2 contracts (API + WebSocket payloads)
│   ├── ingestion/
│   │   ├── base.py                 # CorridorDataProvider & FreightDataProvider ABCs
│   │   ├── live_poller.py          # 120s batched train poller + Open-Meteo 15m weather cache
│   │   ├── ulip_webhook.py         # Enterprise ULIP FOIS rake state override handler
│   │   └── replay_provider.py      # Local JSON/SQLite snapshot + deterministic demo time-warp
│   ├── engine/
│   │   ├── chainage_mapper.py      # Snaps GPS/station events -> 1D chainage & splits run vs dwell
│   │   ├── freight_shadow.py       # Phantom Freight Shadow STR inference + TSR disambiguator
│   │   ├── overtake_sim.py         # Discrete-event priority overtake & loop-line simulator
│   │   ├── slack_adjuster.py       # Sectional terminal slack subtraction (capped at 0 delay)
│   │   ├── quantile_ml.py          # LightGBM P10/P50/P90 wrapper + non-crossing enforcement
│   │   └── rescue_engine.py        # Safe-Boarding Guardrail + survival math + OSRM road hop
│   ├── api/
│   │   ├── v1/
│   │   │   ├── corridor.py         # GET /corridor/state, /corridor/topology (GeoJSON)
│   │   │   ├── forecast.py         # GET /trains/{train_no}/forecast
│   │   │   ├── rescue.py           # POST /rescue/evaluate
│   │   │   ├── webhooks.py         # POST /webhooks/ulip-fois
│   │   │   └── demo_control.py     # POST /demo/inject-freight, /demo/speed, /demo/reset
│   │   └── ws.py                   # /ws/corridor fan-out manager with backpressure drop
├── ml/
│   ├── generate_training_data.py   # Synthetic + historical ECoR cascade dataset builder
│   ├── train_lightgbm.py           # Trains & exports p10.txt, p50.txt, p90.txt models
│   └── artifacts/                  # Pre-trained LightGBM booster files (<5 MB total)
├── data/
│   ├── seed_ecor_topology.json     # Bhadrak-Bhubaneswar-Palasa + Puri branch blocks & loops
│   ├── seed_osrm_matrix.json       # Pre-cached road transfer times (Cuttack->BBS NH-16, etc.)
│   └── fallback_snapshots.json     # Offline corridor snapshots for Wi-Fi-out resilience
├── tests/
│   ├── test_freight_shadow.py      # Unit tests for STR, TSR filtering, UP/DN isolation
│   ├── test_overtake_sim.py        # Double overtake, occupied loop, slack floor tests
│   └── test_rescue_guardrails.py   # Non-stop halt check, pre-boarding liability lock tests
└── docker-compose.yml              # PostGIS 16 + Redis 7 + FastAPI Uvicorn


3. Database Schema (PostgreSQL + PostGIS)
Design the schema so static railway physics live in PostgreSQL/PostGIS, while high-churn live state lives in Redis. Maintain an identical lightweight SQLite mirror for zero-dependency offline fallback.



SQL
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Stations & Commercial Halt Topology
CREATE TABLE stations (
    station_code        VARCHAR(10) PRIMARY KEY,      -- e.g., 'BHC', 'JKPR', 'CTC', 'BBS', 'KUR', 'PURI', 'PSA'
    station_name        VARCHAR(100) NOT NULL,
    corridor_branch     VARCHAR(20) NOT NULL,         -- 'MAINLINE' (BHC-PSA) or 'PURI_BRANCH' (KUR-PURI)
    chainage_km         DOUBLE PRECISION NOT NULL,    -- Linear 1D distance from Bhadrak (0.0 km)
    has_750m_goods_loop BOOLEAN DEFAULT FALSE,        -- Can park a 58-wagon freight rake
    passenger_loops_dn  SMALLINT DEFAULT 1,           -- Southbound (DN) overtaking loop capacity
    passenger_loops_up  SMALLINT DEFAULT 1,           -- Northbound (UP) overtaking loop capacity
    is_major_junction   BOOLEAN DEFAULT FALSE,        -- Valid road-transfer hub (CTC, BBS, KUR)
    road_exit_penalty_m SMALLINT DEFAULT 12,          -- Mins to exit platform + board cab
    geom                GEOMETRY(Point, 4326) NOT NULL
);

-- 2. Directional Block Sections (Strictly Separating UP and DN Lines!)
CREATE TABLE track_blocks (
    block_id                 VARCHAR(32) PRIMARY KEY, -- e.g., 'DN_JKPR_NRG'
    direction                VARCHAR(4) NOT NULL CHECK (direction IN ('UP', 'DN')),
    from_station             VARCHAR(10) REFERENCES stations(station_code),
    to_station               VARCHAR(10) REFERENCES stations(station_code),
    start_km                 DOUBLE PRECISION NOT NULL,
    end_km                   DOUBLE PRECISION NOT NULL,
    length_km                DOUBLE PRECISION NOT NULL,
    mps_kmph                 SMALLINT NOT NULL,       -- Max Permissible Speed (110 or 130 km/h)
    free_flow_mins           DOUBLE PRECISION NOT NULL,
    freight_injection_weight DOUBLE PRECISION DEFAULT 0.15, -- 0.85+ at Jakhapura, Nergundi, Barang
    terminal_slack_mins      DOUBLE PRECISION DEFAULT 0.0,  -- 30-45m built-in buffer approaching KUR/PURI
    is_single_line_throat    BOOLEAN DEFAULT FALSE,   -- True at junction throats where UP/DN cross
    geom                     GEOMETRY(LineString, 4326) NOT NULL
);

-- 3. Train Master & Priority Hierarchy
CREATE TABLE trains_master (
    train_no            VARCHAR(10) PRIMARY KEY,
    train_name          VARCHAR(100) NOT NULL,
    train_class         VARCHAR(25) NOT NULL,         -- 'VANDE_BHARAT', 'RAJDHANI', 'SUPERFAST', 'MAIL_EXP', 'PASSENGER'
    priority_rank       SMALLINT NOT NULL,            -- 1 (Highest: Vande Bharat) to 5 (Passenger)
    direction           VARCHAR(4) NOT NULL CHECK (direction IN ('UP', 'DN')),
    max_speed_kmph      SMALLINT NOT NULL
);

-- 4. Scheduled Commercial Halts (Critical to avoid recommending deboarding at non-stop stations!)
CREATE TABLE train_schedule_halts (
    id                  SERIAL PRIMARY KEY,
    train_no            VARCHAR(10) REFERENCES trains_master(train_no),
    station_code        VARCHAR(10) REFERENCES stations(station_code),
    stop_sequence       SMALLINT NOT NULL,
    day_offset          SMALLINT DEFAULT 0,           -- Handles multi-day midnight crossings
    sched_arr_min_day   SMALLINT NOT NULL,            -- Minutes from 00:00 IST (0-1439)
    sched_dep_min_day   SMALLINT NOT NULL,
    is_commercial_halt  BOOLEAN NOT NULL DEFAULT TRUE, -- FALSE = pass-through timing point only
    scheduled_dwell_m   SMALLINT DEFAULT 2
);

-- 5. Pre-Cached Road Hop Matrix (Fallback if live OSRM times out)
CREATE TABLE road_transfer_cache (
    from_station        VARCHAR(10) REFERENCES stations(station_code),
    to_station          VARCHAR(10) REFERENCES stations(station_code),
    highway_name        VARCHAR(50),                  -- e.g., 'NH-16'
    distance_km         DOUBLE PRECISION NOT NULL,
    base_drive_mins     DOUBLE PRECISION NOT NULL,
    route_geojson       JSONB NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (from_station, to_station)
);


4. Redis Keyspace & Circuit-Breaker Architecture
Use Redis strictly for ephemeral hot state with explicit TTLs so stale data can never silently poison predictions.

Redis Key Pattern
Data Type
TTL
Purpose
corridor:ecor:snapshot:latest
JSON String
300s
Atomic 120s snapshot of all active trains on the corridor.
corridor:ecor:snapshot:prev
JSON String
600s
Previous snapshot to calculate delta velocity & block traversal times.
corridor:ecor:weather
Hash
900s
Open-Meteo 15-min rainfall (mm/hr) and wind speed per track zone.
corridor:ecor:ulip_rakes
Hash
600s
Active enterprise ULIP FOIS rake positions (overrides shadow inference when present).
corridor:ecor:block_history:{block_id}
List (cap 10)
3600s
Rolling history of last 10 passenger train STR values on this block (used to distinguish TSR vs. Freight).
osrm:route:{from}:{to}
JSON String
1800s
Cached live OSRM road transfer geometry & duration.

Circuit-Breaker Fallback Hierarchy
If an external API call fails, times out (> 4s), or returns HTTP 429/5xx, degrade gracefully without throwing 500 to the frontend:
Tier 1 (Live): Fetch corridor train feed + Open-Meteo  update Redis.
Tier 2 (Stale Redis): If Live fails and snapshot:latest is < 10 mins old, advance train positions forward via 1D dead-reckoning and attach header X-Data-Quality: STALE_EXTRAPOLATED.
Tier 3 (Local Replay Fallback): If Redis is down or empty, load data/fallback_snapshots.json / SQLite replay state and attach X-Data-Quality: LOCAL_REPLAY so the dashboard and demo never crash.
5. Deep-Dive: The 5-Stage Backend Intelligence Pipeline
Every 120 seconds (or every 1–2 seconds in Demo Time-Warp Mode), the orchestrator runs this exact deterministic pipeline for all active trains on each directional track (DN and UP separately):
Stage 1: 1D Chainage Mapping & Dwell-vs-Run Separation
Raw train feeds often report delayed departures mixed with slow running times.
Separate Station Dwell from Block Traversal: Compute actual_block_run_mins = (arr_time_next_station - dep_time_prev_station). Never include station halt dwell time (dep_time - arr_time) inside the STR block-speed calculation, otherwise a 15-minute watering or crew-change halt at Cuttack looks like a phantom freight train.
Sort Trains Along Directional Chainage: Order all active trains on DN (chainage_km ascending) and UP (chainage_km descending) to compute exact Preceding Headway (tahead) and Trailing Headway (tbehind) in minutes.
Stage 2: Phantom Freight Shadow Engine + TSR Disambiguator
For each block s where an active passenger train i just traversed (or is currently traversing):
Enterprise Override First: Check corridor:ecor:ulip_rakes. If an authorized ULIP FOIS webhook reports a real freight rake in block s, return freight_probability = 1.0, source = "ULIP_FOIS_CONFIRMED", and compute exact loop clearance time.
Kinematic STR Computation:


STRi,s=Tactual_run(i,s)Tfree(s)


Exclusion Gates (Preventing False Positives):
Gate A (Normal Speed): If STR<1.50, no freight shadow.
Gate B (Visible Coaching Congestion): If a visible passenger train i-1 is within < 15 mins ahead on the same direction, classify as COACHING_CONGESTION.
Gate C (Static TSR / Signal Fault Filter): Inspect corridor:ecor:block_history:{block_id}. If 3 or more consecutive passenger trains over the last 45+ minutes have all experienced STR1.50 at the exact same block despite wide gaps, reclassify from PHANTOM_FREIGHT_SHADOW to STATIC_TSR_OR_SIGNAL_FAULT (a freight train moves out in 15–30 minutes; a track maintenance TSR persists for hours).
Gate D (Weather Discount): Apply rainfall drag discount if Open-Meteo rain_mm_hr > 15.0.
Bayesian Score & Clearance Math: Combine STR, empty passenger headway ahead, and the block's industrial junction prior (0.85 at Jakhapura, Nergundi, Barang; 0.15 elsewhere). If freight_probability >= 0.60, scan downstream stations for the next station where has_750m_goods_loop = TRUE and compute clearance penalty assuming 30km/h freight speed + 6min loop entry/signal clearance.
Stage 3: Priority Overtake & Loop-Line Discrete-Event Simulator
Simulate the next 180 minutes forward across upcoming stations along the corridor:
Catch-Up Detection: For target train i (priority Pi) and every trailing train j behind it on the same direction with higher priority (Pj<Pi, e.g., Vande Bharat behind a Mail/Express):
Compute closing rate v=vj-vi.
If projected arrival of train j at upcoming station k falls within a 10 min safety headway of train i's departure from station k, flag an Overtake Conflict.
Loop-Line Capacity Check: Find the earliest upstream/current station k with available directional loop capacity (passenger_loops_dn > occupied_loops_at_time_t).
Hold train i in the loop until train_j_pass_time + 6 min (block clearance + starter signal aspect).
Double-Overtake Check: Re-evaluate the loop release time against the next trailing high-priority train j+1. If another express is only 8 minutes behind train j, extend train i's loop hold rather than falsely releasing it onto the mainline.
Explainable Causal Card Generation: Every simulated hold emits a structured reason object:
JSON
{
  "event": "PRIORITY_OVERTAKE_HOLD",
  "station_code": "CTC",
  "station_name": "Cuttack Jn",
  "added_delay_mins": 14,
  "caused_by_train": "20836 Vande Bharat Express",
  "human_message": "Expected +14 min hold at Cuttack Loop Line for 20836 Vande Bharat overtake"
}


Stage 4: Terminal Slack Subtraction & LightGBM Quantile Regression (P10 / P50 / P90)
Slack Subtraction Floor: Sum terminal_slack_mins across remaining blocks (e.g., 30–45 mins approaching Khurda Road / Puri). Apply recovery strictly as:


NetProjectedDelay=(0,CurrentDelay+Dfreight+Dovertake-UsableSlack)

Critical Rule: Usable recovery slack is capped at 75% of total scheduled slack when rain_mm_hr > 10 or freight_probability > 0.6 (trains cannot recover full slack on congested/wet tracks), and total delay can never drop below 0 minutes at intermediate commercial halts (a train cannot depart a station earlier than its published timetable).
LightGBM Quantile Inference: Pass the engineered feature vector [current_delay, net_sim_delay, freight_prob, overtake_count, overtake_mins, usable_slack, rain_mm_hr, hour_of_day, junction_congestion_idx] into three pre-trained LightGBM boosters (objective="quantile", {0.10,0.50,0.90}).
Run inference via asyncio.to_thread() (even though <5 ms, keeps the event loop pure).
Quantile Non-Crossing Guard (Mandatory Edge-Case Fix): Independently trained quantile trees can occasionally produce P10>P50 or P50>P90 on outlier inputs. Always enforce strict monotonicity post-inference:
Python
p10, p50, p90 = sorted([raw_p10, raw_p50, raw_p90])
# Enforce minimum realistic uncertainty spread (at least +/- 3 mins per remaining 50 km)
min_spread = max(3.0, remaining_km * 0.06)
p10 = min(p10, p50 - min_spread * 0.5)
p90 = max(p90, p50 + min_spread)


Stage 5: Asymmetric Liability Guardrail & Early-Junction Rescue Engine
This is what separates a safe real-world decision engine from a dangerous hackathon toy.
Safe-Boarding Rule (Pre-Boarding Lock):
Every rescue request includes passenger_status: Literal["PRE_BOARDING", "ON_BOARD"].
If passenger_status == "PRE_BOARDING": lock boarding guidance strictly to the official railway scheduled departure time. Return boarding_advisory: "Reach your boarding station as per official schedule. Delayed trains can recover slack or be rescheduled." Never trigger road-hop overrides before the passenger has boarded.
Connection Survival Probability (Psurvive):
Given user's destination connection_deadline_utc and required station transfer buffer (e.g., 15 mins for connecting train, 60 mins for airport flight), interpolate survival probability continuously across the piecewise P10 / P50 / P90 CDF.
If Psurvive0.40: status = SAFE or WATCH (no road hop triggered).
OSRM Early-Junction Rescue Search (Triggers when Psurvive<0.40):
Filter upcoming stations ahead of the train's current chainage_km using four strict eligibility filters:
is_commercial_halt == TRUE for this specific train_no (never tell a passenger to jump off a moving non-stop express!).
is_major_junction == TRUE (must have reliable cab/bus availability like Cuttack, Bhubaneswar, Khurda Road).
Train ETA to that rescue junction is at least >= 12 minutes away (gives the passenger time to gather luggage and reach the door safely).
Station lies before the projected major loop-line overtake or terminal throat bottleneck.
Query OSRM (router.project-osrm.org) — falling back to road_transfer_cache if OSRM > 2.5s — for road drive time from rescue_station to final_destination (e.g., Cuttack  Bhubaneswar via NH-16).
Compute True Door-to-Door Road Arrival:


RoadETA=TrainP50_At_RescueStation+StationExitCabPickupMins(12m)+(OSRM_DriveMinsPeakTrafficFactor)


Recommend the Early-Junction Hop only if RoadETA beats TrainP50_At_Destination by at least >= 10 minutes AND achieves a strictly higher connection survival probability. Always attach the safety disclaimer that deboarding remains the passenger's voluntary choice subject to railway safety rules.
6. Complete Edge-Case & Failure-Mode Matrix

#
Edge Case / Failure Mode
What Breaks in Naive Implementations
How RAIL-PULSE Backend Handles It
1
Non-Stop Station Rescue
Recommends getting off at Cuttack on a train that skips Cuttack.
Queries train_schedule_halts.is_commercial_halt = TRUE before evaluating any rescue junction.
2
Quantile Crossing (P50>P90)
UI renders broken inverted ETA range bars.
Post-inference sorting + minimum distance-scaled spread guarantee.
3
UP vs. DN Track Mixing
A southbound freight train triggers a Phantom Freight alert for a northbound express.
Strict partitioning by direction IN ('UP', 'DN'); only junction throats (is_single_line_throat) cross-check opposite traffic.
4
TSR / Track Maintenance Mistaken for Freight
Every train slows on a permanent speed restriction, spawning 5 fake "Ghost Freights."
Redis block_history checks if 3 consecutive trains over 45m share STR1.5 and reclassifies as STATIC_TSR.
5
Station Dwell Inflating STR
20-min scheduled watering/crew halt looks like a slow block traversal.
Computes STR strictly on arr(B) - dep(A), completely excluding dep(A) - arr(A) dwell time.
6
Midnight Timestamp Rollover
Train departs 23:45, arrives 00:35  negative -1390 min delta crashes math.
Normalize all timestamps internally to UTC Unix epoch seconds (int) using day_offset from train_schedule_halts.
7
Terminal Slack Over-Subtraction
Subtracting 40 min slack from a 15 min delay predicts arrival 25 mins early.
Clamp net delay at >= 0 for all intermediate halts; cap usable slack at 75% under rain/congestion.
8
Double Priority Overtake
Releases train from loop line right into a second trailing Superfast train.
Iterative discrete-event loop checks release_time against all trailing priority trains within a 15-min window.
9
No Available Loop Line
Simulator tries to overtake at a 2-track halt with no side loop.
Checks passenger_loops_dn / up > 0 and loop occupancy table; pushes overtake to the next valid loop station.
10
Pre-Boarding Missed-Train Liability
Tells user at home their train is 40m late; train recovers slack and leaves without them.
Safe-Boarding Rule locks pre-boarding status to official timetable; rescue activates strictly on ON_BOARD.
11
OSRM API Down / Slow / Unrealistic Drive Time
Rescue endpoint hangs 10s or forgets 12 mins needed to walk out of station and get a cab.
2.5s timeout  road_transfer_cache fallback + mandatory road_exit_penalty_m + peak-hour multiplier (1.25x during 8–11 AM / 5–8 PM).
12
WebSocket Fan-Out Bottleneck
1 slow client blocks await ws.send_json() for all other connected clients.
Use asyncio.gather(..., return_exceptions=True) with a 1.0s per-client timeout and auto-disconnect slow consumers.
13
Event Loop Blocking (ML/DB)
Synchronous LightGBM or heavy JSON parsing freezes FastAPI heartbeats.
100% async asyncpg + redis.asyncio; wrap ML/simulation bursts in asyncio.to_thread().
14
Late-Night Demo / Quiet Real-World Track
During hackathon judging at 2 PM or 11 PM, no real Vande Bharat overtake is happening on ECoR right now.
Built-in Scenario Control API (/api/v1/demo/...) runs the exact Bhadrak  Cuttack  Bhubaneswar 28-min delay + Ghost Freight + Vande Bharat overtake scenario on demand at 1x / 10x / 30x speed.

7. API Contracts & WebSocket Schema
REST Endpoints (/api/v1)
GET /health — Reports DB status, Redis status, active provider (LIVE, REPLAY, DEMO), and ML model load status.
GET /corridor/topology — Returns static PostGIS GeoJSON for ECoR tracks, stations, 750m goods loops, and industrial freight chord markers (cached heavily by frontend).
GET /corridor/state — Returns the latest snapshot of all active trains, active Phantom Freight Shadows, and weather drag badges.
GET /trains/{train_no}/forecast — Returns full breakdown: naive_ntes_eta, p10_eta, p50_eta, p90_eta, usable_slack_mins, causal_cards[], and overtake_timeline[].
POST /rescue/evaluate — Accepts {train_no, destination_code, connection_deadline_utc, transfer_buffer_mins, passenger_status}. Returns survival_probability, risk_level, safe_boarding_lock, and (if < 0.40 and ON_BOARD) the verified early_junction_hop with OSRM polyline and minutes saved.
POST /webhooks/ulip-fois — Authenticated enterprise endpoint (X-ULIP-API-Key) accepting {rake_id, block_id, direction, speed_kmph, timestamp_utc} to inject confirmed freight positions directly into Redis.
POST /demo/scenario/start & POST /demo/inject-freight — Allows you to trigger the exact Bhadrak  Cuttack  Bhubaneswar overtake + freight shadow live in front of judges.
WebSocket Stream (WS /ws/corridor)
Broadcast every 1.5 seconds:



JSON
{
  "tick_utc": 1795071600,
  "mode": "DEMO_10X",
  "data_quality": "LIVE_SIM",
  "trains": [
    {
      "train_no": "12821",
      "name": "Dhauli Express",
      "direction": "DN",
      "chainage_km": 112.4,
      "lat": 20.4625,
      "lng": 85.8829,
      "speed_kmph": 34.0,
      "current_delay_mins": 28,
      "p10_eta_bbs": "12:02",
      "p50_eta_bbs": "12:09",
      "p90_eta_bbs": "12:24",
      "status": "TRAILING_FREIGHT_SHADOW"
    }
  ],
  "phantom_freights": [
    {
      "block_id": "DN_JKPR_NRG",
      "chainage_km": 118.2,
      "confidence": 0.86,
      "source": "KINEMATIC_INFERENCE",
      "clearance_station": "NRG",
      "clearance_eta_mins": 11.5
    }
  ]
}


8. Phased Backend Execution Plan (Zero-Waste Build Order)
Build strictly bottom-up so every layer is unit-tested before plugging into the next:
Phase 1 — Infrastructure & Seed Data (Hours 0–3):
Spin up docker-compose.yml (PostGIS 16 + Redis 7).
Write seed_ecor_topology.json (exact Bhadrak  Jakhapura  Nergundi  Cuttack  Barang  Bhubaneswar  Khurda Road  Puri / Palasa chainage, 750m loops, industrial priors, and terminal slack) + seed_osrm_matrix.json (Cuttack  BBS NH-16 = ~28 km / ~35 mins).
Run DB migrations & verify /corridor/topology returns clean GeoJSON.
Phase 2 — Pure Physics & Math Engines (Hours 3–7):
Implement chainage_mapper.py, freight_shadow.py, overtake_sim.py, and slack_adjuster.py as pure, stateless Python functions with zero DB/Redis calls inside them.
Run pytest on all 14 edge cases (UP/DN isolation, TSR filter, double overtake, midnight rollover, slack floor).
Phase 3 — LightGBM Quantile Models & Rescue Engine (Hours 7–10):
Run generate_training_data.py (5,000 realistic ECoR corridor trips covering clear runs, overtakes, freight shadows, and monsoon drag) and train_lightgbm.py to export p10.txt, p50.txt, and p90.txt.
Implement quantile_ml.py (with non-crossing enforcement) and rescue_engine.py (with Safe-Boarding lock, commercial-halt check, and OSRM + fallback cache).
Phase 4 — Ingestion, Resilience & Demo Time-Warp (Hours 10–13):
Wire live_poller.py (120s corridor sync + Open-Meteo + Redis circuit breaker) and replay_provider.py (deterministic Bhadrak  Bhubaneswar demo scenario matching your pitch numbers: 28-min delay, 12:15 PM deadline, 12:09 PM P50 / 12:24 PM P90, 21-min Cuttack NH-16 rescue).
Wire /webhooks/ulip-fois so you can even demo an enterprise freight webhook curl command if a judge asks.
Phase 5 — WebSocket Fan-Out, Stress Testing & Integration (Hours 13–16):
Hook /ws/corridor to the React + MapLibre GL frontend.
Kill Redis and disconnect Wi-Fi intentionally to verify Tier-3 LOCAL_REPLAY fallback works seamlessly with zero 500 errors.
Benchmark /trains/{train_no}/forecast and /rescue/evaluate latency (target <40 ms p95).
If you want to start coding right away, tell me which module you want generated first—the PostgreSQL + PostGIS seed script & ORM models, the pure physics + overtake + freight engine, or the LightGBM training & quantile inference pipeline.
Here is a ruthless engineering audit of the backend master plan and how it aligns with your pitch deck. Fixing these 7 architectural/logic bugs and cutting 5 hackathon over-commitments will save you hours of debugging and stop sharp judges from poking holes in your math.
1. Critical Bugs & Logic Flaws to Fix Immediately
Bug 1: Backwards Geography in the Seed & Demo Payload
In the backend master plan's WebSocket example, Cuttack was placed at 112.4 km and DN_JKPR_NRG (Jakhapura–Nergundi) was placed ahead of it at 118.2 km. That is geographically backwards. Moving southbound (DN) from Bhadrak toward Bhubaneswar, the real physical order is:
Bhadrak (0 km)  Jajpur Keonjhar Rd (44 km)  Jakhapura (51 km)  Nergundi (106 km)  Cuttack (115 km)  Barang (128 km)  Bhubaneswar (143 km)  Khurda Rd (162 km)  Puri (206 km)
Any judge from Bhubaneswar or Odisha knows Jakhapura and Nergundi are north of Cuttack. If your demo shows a train leaving Cuttack and then hitting a freight shadow at Jakhapura, you lose instant credibility. Use Barang (128 km)—where Talcher coal rakes actually merge onto the mainline—for any freight bottleneck between Cuttack and Bhubaneswar.
Bug 2: Branching Tracks Break 1D Chainage Sorting
Your NIRMAN deck specifies the Bhadrak–Bhubaneswar–Palasa corridor, your pitch script specifies Bhadrak–Cuttack–Bhubaneswar–Khurda Road–Puri, and the database schema tried to support both (MAINLINE + PURI_BRANCH).
The Bug: Once tracks split at Khurda Road (162 km) into two branches (PURI vs. PALASA), sorting trains by a single chainage_km fails. A train at 175 km on the Puri branch and a train at 178 km on the Palasa mainline will look 3 km apart to your overtake/freight engine and trigger phantom overtakes across completely different tracks.
The Fix: Pick one linear branch for the MVP (Bhadrak → Cuttack → Bhubaneswar → Khurda Road → Puri) OR partition simulation runs by (corridor_branch, direction)—never mix branches in one sorted list.
Bug 3: The "12:15 PM Deadline / 21 Minutes Saved" Math Contradiction
In your pitch script, the demo claims: 12:15 PM Bhubaneswar deadline, 12:09 PM expected (P50) arrival, 12:24 PM P90 arrival, and a Cuttack NH-16 cab saving 21 minutes. Meanwhile, your architecture triggers rescue only when connection survival drops below 40%.
The Bug:
If P50 (median arrival) is 12:09 PM and the deadline is 12:15 PM, then strictly > 50% of outcomes arrive before 12:15 PM—so survival is above 50%, meaning your < 40% rule would never even fire unless you enforce a mandatory 15-minute platform transfer buffer (making the effective cutoff 12:00 PM).
Normally, a train takes ~28 mins from Cuttack to Bhubaneswar, whereas a cab via NH-16 + exiting Cuttack station takes ~50 mins. A judge will ask: "How does a 50-minute cab ride beat a 28-minute train ride by 21 minutes?"
The Fix (Calibrated Math That Holds Up Under Scrutiny):
Deboard at Cuttack (CTC): 10:58 AM + 10 min station exit/cab pickup + 40 min NH-16 drive = 11:48 AM arrival at Bhubaneswar (27 min safety buffer before 12:15 PM).
Stay on Train (CTC  BBS): 10:58 AM + 5 min Cuttack dwell + 28 min base run + 18 min loop-line hold at Barang for a Vande Bharat overtake + 20 min drag behind a Talcher coal freight shadow merging at Barang = 12:09 PM (P50) and 12:24 PM (P90).
Result: 12:09 PM - 11:48 AM = exact 21 minutes saved. With a 15-min transfer buffer (12:00 PM effective cutoff), train survival drops to ~18%, legally triggering the < 40% rescue engine.
Bug 4: Double-Counting Delays Between the Physics Simulator and LightGBM
Passing [current_delay, net_sim_delay, freight_prob, overtake_mins] into LightGBM trained on synthetic data causes two problems:
If LightGBM predicts total delay directly, its output can contradict your Explainable Causal Cards (e.g., cards sum to +38 mins, while LightGBM outputs +24 mins).
Training a tree model on synthetic numbers generated by your own physics formula just learns a noisy copy of your formula—a sharp ML judge will call it unnecessary bloat.
The Fix (Physics-Guided Residual Quantiles): Let the deterministic physics engine compute the exact P50_base so it matches your Causal Cards to the minute. Train LightGBM strictly to predict the contextual uncertainty residuals (10,50,90) from weather, time-of-day, freight probability, and remaining distance—then add those residuals to P50_base.
Bug 5: Multi-Worker Split-Brain with In-Memory State
The plan combines an in-process CorridorStateStore dictionary and a background asyncio poller inside FastAPI's lifespan. If anyone launches Uvicorn with --workers 4, you spawn 4 duplicate pollers hammering the API and 4 desynchronized RAM states where Demo Mode /demo/inject-freight updates Worker 1 while the frontend WebSocket listens to Worker 2.
The Fix: Lock deployment strictly to uvicorn app.main:app --workers 1 for the hackathon. One single-process async FastAPI server easily handles 1,000+ WebSockets and < 40 ms inference with zero state desync.
Bug 6: UTC vs. IST Midnight Rollover Trap
The schema stores sched_arr_min_day (0–1439 in IST) while the rescue API accepts connection_deadline_utc. UTC midnight happens at 5:30 AM IST—mixing UTC day boundaries with IST timetable day_offset values guarantees off-by-one-day bugs during early morning trains.
The Fix: Compute all schedule dates in ZoneInfo("Asia/Kolkata") first, then convert cleanly to Unix epoch integers (int) for every internal calculation.
Bug 7: Isolated Per-Train Simulation Over-Books Loop Lines
Running the overtake simulator one train at a time allows two delayed passenger trains to claim the exact same single loop line at Barang at the exact same minute.
The Fix: Run one corridor-wide chronological sweep per direction (DN and UP) per tick using a shared loop_occupancy[(station_code, direction)] schedule, then cache the computed forecast for every train in that single pass.
2. Over-Commitments & Hidden Traps (Fix Before Judging)

Over-Commitment
Why It Will Burn You
Concrete Fix
1. Dual PostgreSQL/PostGIS + SQLite Mirror
GeoAlchemy2 PostGIS geometry types crash on SQLite unless you compile native SpatiaLite libraries—a notorious Windows/Docker nightmare during a hackathon.
Delete SQLite completely. Store static topology (~50 KB) in seed_ecor_topology.json. Load from PostGIS at startup; if Postgres fails, load the exact same Pydantic objects directly from the JSON file into RAM.
2. "Poll All Active Trains Every 120s" via Public APIs
Free Indian Railways RapidAPI tiers are per-train and cap at ~20–50 calls/day. Polling 25 trains every 120 seconds = 750 calls/hour, burning your key in 15 minutes.
Use Live Station Board endpoints at just 4 hubs (BHC, CTC, BBS, KUR = 4 calls total) on a 5-min TTL for live mode, and default your judge demo to the Deterministic ECoR Simulation Engine with a live-toggle badge.
3. Unverified Accuracy Claims on Slide 5
Slide 5 bolds "35–45% Sharper ETA Accuracy (14–22 mins)", while your own Q&A checklist warns not to present MAE numbers until a 50-run backtest is actually executed.
Run an actual 50-scenario simulation benchmark script (ml/run_backtest.py) comparing Naive (Schedule + Delay) vs. RAIL-PULSE on historical/synthetic overtake & freight scenarios, log the real CSV output, and verbally call it "in our 50-run corridor benchmark" rather than live production telemetry.
4. Slide 6 Citation Date Mismatch
Slide 6 cites arXiv:2510.01262 as Aug. 2026, even though arXiv ID 2510 explicitly denotes October 2025. Academic judges spot mismatched arXiv dates instantly.
Double-check that exact paper title, authors, and arXiv ID manually before printing/submitting Slide 6—if you cannot verify arXiv:2510.01262 verbatim, replace it with a verified railway delay propagation paper from IEEE Xplore or IIT Kharagpur.
5. Calling ULIP FOIS a "Webhook"
PM GatiShakti's ULIP (FOIS API) is primarily an authenticated REST pull integration (querying by Rake/FNR/eT-RR), not an outbound push webhook.
Rename the adapter to ULIP FOIS Enterprise Connector (Adapter Pattern) in code and speech. You can still keep POST /api/v1/demo/inject-ulip-rake to demonstrate enterprise override live.
6. is_single_line_throat Interlocking
The Bhadrak–Khurda Road–Puri corridor is already multi-track electrified. Coding bidirectional single-line deadlocks adds huge complexity for zero visual value.
Cut it. Keep UP and DN completely independent directional tracks.

3. Realistic 18-Hour Build Scope (What to Build vs. Cut)
Even with 5 teammates, building everything in the original master plan in 16–18 hours leaves zero integration buffer. Lock this strict boundary:

Component
Must-Build MVP (Hours 0–14)
Cut / Defer Until After MVP Works
Corridor Topology
Single clean corridor: BHC → JKPR → NRG → CTC → BRAG → BBS → KUR → PURI in PostGIS + JSON RAM fallback.
Palasa branch merging, single-line throats, SQLite mirror.
Ingestion & Cache
Redis snapshot cache + deterministic ECoR Demo Time-Warp (1x / 10x) + Open-Meteo live weather fetch.
Multi-API scraping rotator, automatic 25-train live polling loop.
Physics & ML Core
1D chainage mapper, STR >= 1.5x Phantom Freight detector, corridor-wide loop overtake simulator, slack subtraction floor, LightGBM residual quantile booster (P10/P50/P90), non-crossing guard.
Complex rolling 10-train TSR history in Redis (keep TSR check as a simple 2-train consecutive check in RAM).
Rescue & Guardrail
Safe-Boarding pre-boarding lock, commercial-halt check, survival probability math, live OSRM call with seed_osrm_matrix.json fallback.
Multi-leg bus+train chained routing, live Uber/Rapido fare APIs.
Validation
One clean python ml/run_backtest.py script generating real MAE comparison numbers for judges.
Real-time online model retraining.
Demo Controls
POST /demo/inject-freight, POST /demo/speed, POST /demo/reset buttons hidden in a small presenter drawer on the UI.
Full RBAC user login/JWT auth (skip auth completely—it slows down judge demos unless required by the rubric).

If you agree with this tightened scope, the cleanest next step is to generate the exact geographically verified seed_ecor_topology.json (Bhadrak to Puri with real station coordinates, chainage, 750m loops, industrial junction priors, and Barang/Cuttack NH-16 road cache) so both your backend and frontend teammates can build against the exact same truth from Hour 1.
