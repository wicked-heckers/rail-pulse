# RAIL-PULSE 🚆⚡

> **Cascade-Aware Train ETA, Dynamic Overtake & Multimodal Connection Rescue Engine**  
> *Developed for HackNation 6.0 • Benchmark: SIH26028 • Corridor: East Coast Railway (ECoR Trunk Line)*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![LightGBM](https://img.shields.io/badge/LightGBM-CQR_Quantiles-FFA100.svg?logo=scikitlearn&logoColor=white)](https://lightgbm.readthedocs.io/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-60_FPS_WebGL-396B9E.svg?logo=maplibre&logoColor=white)](https://maplibre.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4.svg?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PostGIS](https://img.shields.io/badge/PostGIS-16-336791.svg?logo=postgresql&logoColor=white)](https://postgis.net/)
[![Redis](https://img.shields.io/badge/Redis-7.0_Cache-DC382D.svg?logo=redis&logoColor=white)](https://redis.io/)
[![Tests](https://img.shields.io/badge/Tests-41%20Passed-brightgreen.svg?logo=pytest&logoColor=white)](https://docs.pytest.org/)
[![Code Style](https://img.shields.io/badge/Code_Style-Ruff_Clean-black.svg?logo=ruff&logoColor=white)](https://astral.sh/ruff)

---

## 📖 Table of Contents
1. [The Real-World Problem & Why Current Apps Fail](#-the-real-world-problem--why-current-apps-fail)
2. [The 4 Hidden Railway Walls](#-the-4-hidden-railway-walls)
3. [Core Architectural Blueprint](#-core-architectural-blueprint)
4. [The 5-Stage Intelligence Pipeline](#-the-5-stage-intelligence-pipeline)
5. [Calibrated Demonstration Scenario: Dhauli Express 12821](#-calibrated-demonstration-scenario-dhauli-express-12821)
6. [Frontend Experience: WIMT Story & 60 FPS WebGL Digital Twin](#-frontend-experience-wimt-story--60-fps-webgl-digital-twin)
7. [50-Run Benchmark Scorecard](#-50-run-benchmark-scorecard)
8. [The 14 Handled Edge Cases & Mitigation Matrix](#-the-14-handled-edge-cases--mitigation-matrix)
9. [Repository Structure](#-repository-structure)
10. [Quickstart & Installation Guide](#-quickstart--installation-guide)
11. [REST API & WebSocket Reference](#-rest-api--websocket-reference)
12. [License & Acknowledgements](#-license--acknowledgements)

---

## 💥 The Real-World Problem & Why Current Apps Fail

Every day, over **23 million passengers** across Indian Railways—and thousands of travelers along the high-density **East Coast Railway (ECoR)** trunk line (**Bhadrak ➔ Jajpur ➔ Cuttack ➔ Bhubaneswar ➔ Khurda Road ➔ Puri**)—rely on live train tracking apps (NTES, Where Is My Train, Ixigo) to plan transfers, flights, and exam reporting times.

### The Fatal Flaw of Legacy Tracking Apps
Existing public systems treat every train as if it runs in **complete isolation on an empty track**. They calculate arrival delays using a naive linear formula:

$$\text{ETA}_{\text{legacy}} = T_{\text{scheduled}} + \Delta t_{\text{current}}$$

When a coaching train falls 20–25 minutes behind schedule, it **loses its sectional slot**. Section Controllers at Khurda Road Divisional Control Office divert the delayed train into a **station loop line** so a trailing higher-priority train (such as the *22895 Howrah–Puri Vande Bharat Express* or *12841 Coromandel Express*) can overtake it at full sectional speed.

**A minor 22-minute delay snowballs into an 80+ minute cascade**, while standard apps continue showing a static 22-minute delay until after the overtake has already happened.

| Operational Factor | Legacy Apps (NTES, Where Is My Train) | **RAIL-PULSE** |
| :--- | :--- | :--- |
| **Delay Propagation** | Linear extrapolation: $\text{Sched} + \text{Delay}_{\text{current}}$ | **Multi-train discrete-event simulation + LightGBM CQR quantile bands ($P_{10}/P_{50}/P_{90}$)** |
| **Rear Overtake Prediction** | 100% blind until train is physically parked in loop | **Predicts exact downstream station where high-priority trains will force a loop hold 30–90 mins ahead** |
| **Invisible Freight (FOIS)** | Blind to unscheduled freight and bulk rakes | **Infers "Phantom Freight Shadows" via kinematic velocity drop ($STR \ge 1.5\times$) with TSR disambiguation** |
| **Timetable Slack** | Static or completely ignored | **Dynamic recovery subtraction clamped at 0 min floor (capped at 75% efficiency during rain/congestion)** |
| **Actionable Output** | Single deterministic timestamp (frequently wrong by 30–60m) | **Probabilistic arrival window + Connection Survival % + Early-Junction Multimodal Road Rescue** |

---

## 🧱 The 4 Hidden Railway Walls

RAIL-PULSE was engineered from the ground up to overcome the four systemic barriers that cause traditional tracking implementations to fail:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 THE 4 RAILWAY WALLS                                    │
├──────────────────────────┬──────────────────────────┬──────────────────────────────────┤
│ WALL 1: GHOST FREIGHT    │ WALL 2: ASYMMETRIC       │ WALL 3: TIMETABLE SLACK          │
│ (FOIS vs NTES Split)     │ PASSENGER LIABILITY      │ (Over-Prediction Trap)           │
│                          │                          │                                  │
│ Coal/iron-ore rakes      │ Pre-boarding users who   │ Railways insert 25–45m hidden    │
│ occupy blocks with zero  │ see a late arrival may   │ slack before terminals (Khurda   │
│ passenger API footprint. │ miss a recovering train. │ Road/Puri). Adding overtakes     │
│ Kinematic STR inference  │ Safe-Boarding Guardrail  │ without deducting slack over-    │
│ detects unannounced      │ locks pre-boarding users │ predicts delays. Dynamic slack   │
│ blocks automatically.    │ to official schedules.   │ subtraction solves this cleanly. │
├──────────────────────────┴──────────────────────────┴──────────────────────────────────┤
│ WALL 4: N-TRAIN API QUOTA EXHAUSTION & VENUE WI-FI OUTAGES                             │
│ Querying external APIs for 20+ concurrent trains burns free rate-limits in minutes.    │
│ An in-process RAM mirror + Redis snapshot cache + local fallback data guarantees       │
│ sub-5ms latency and 100% functionality during complete venue network outages.          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏛️ Core Architectural Blueprint

RAIL-PULSE operates as an asynchronous **FastAPI Modular Monolith** optimized for ultra-low latency (<5 ms RAM state reads, <40 ms full ML pipeline inference):

```mermaid
flowchart TD
    subgraph Data Sources
        LP[Live Poller / RapidAPI]
        DP[Deterministic Demo Time-Warp]
        UW[Enterprise ULIP FOIS Webhook]
        OM[Open-Meteo Weather API]
    end

    subgraph Resilience Layer
        CSS[(CorridorStateStore RAM Mirror)]
        REDIS[(Redis 7 Snapshot Cache)]
        LOCAL[(Local JSON / PostGIS Fallback)]
    end

    subgraph 5-Stage Intelligence Engine
        S1[Stage 1: 1D Chainage Mapper & Dwell Separator]
        S2[Stage 2: Phantom Freight Shadow Engine + TSR Filter]
        S3[Stage 3: Priority Overtake & Loop Simulator]
        S4[Stage 4: Timetable Slack Floor & LightGBM CQR]
        S5[Stage 5: Safe-Boarding Guardrail & Multimodal Bailout]
    end

    subgraph Delivery & Frontend
        REST[FastAPI REST API /api/v1]
        WS[WebSocket Stream /ws/corridor 1.5s Ticks]
        SPA[React 19 + MapLibre GL 60 FPS WebGL Twin]
    end

    LP --> CSS
    DP --> CSS
    UW --> CSS
    OM --> CSS
    CSS <--> REDIS
    CSS -.-> LOCAL

    CSS --> S1 --> S2 --> S3 --> S4 --> S5

    S5 --> REST
    CSS --> WS
    REST --> SPA
    WS --> SPA
```

### Key Engineering Decisions:
1. **1D Chainage Scalar Physics Over 2D GIS Math**: Pre-projects every station, track block, and loop onto a 1D linear chainage axis ($0.0\text{ km}$ at Bhadrak to $206.0\text{ km}$ at Puri). All collision, headway, and overtake math is executed in pure float scalar math in RAM, avoiding expensive 2D PostGIS `ST_Distance` calculations in the simulation loop.
2. **In-Process State Mirror (`CorridorStateStore`)**: Reads hit in-memory dictionaries protected by async read locks, guaranteeing <5ms latency and zero DB lock contention.
3. **Dead-Reckoning WebSocket Broadcasts**: Pushes kinematic state vectors every 1.5 seconds instead of 30 FPS video frames; the client-side MapLibre GL engine performs 60 FPS WebGL interpolation.
4. **Strict Single-Worker Execution**: Locks backend processes to `uvicorn --workers 1` to prevent in-memory state desynchronization across multi-process workers.

---

## ⚡ The 5-Stage Intelligence Pipeline

### Stage 1: 1D Chainage Mapping & Dwell-vs-Run Separation
- **Linear Projection**: Snaps GPS coordinates $(lat, lon)$ onto the corridor track vector using piecewise Haversine interpolation.
- **Dwell Separation**: Computes block traversal time strictly on:
  $$\text{Run Time} = T_{\text{arr}}^{\text{next}} - T_{\text{dep}}^{\text{prev}}$$
  Never includes station halt dwell time ($T_{\text{dep}} - T_{\text{arr}}$) in the Sectional Traversal Ratio, preventing scheduled passenger watering/crew halts from being falsely flagged as freight blocks.
- **Directional Headway Tracking**: Partitions trains by direction (`DN` southbound towards Puri, `UP` northbound towards Bhadrak).

### Stage 2: Phantom Freight Shadow Engine & TSR Disambiguator
Computes the kinematic Sectional Traversal Ratio ($STR$) for every block section $s$:
$$STR = \frac{T_{\text{actual\_run}}}{T_{\text{free\_flow}}}$$

To eliminate false alarms, candidate blocks must pass **4 sequential Exclusion Gates**:
- **Gate A (Normal Speed)**: If $STR < 1.50$, mark `NORMAL_SPEED`.
- **Gate B (Visible Coaching Congestion)**: If a visible scheduled passenger train is within $<15\text{ mins}$ ahead on the same track, classify as `COACHING_CONGESTION`.
- **Gate C (Static TSR / Maintenance Filter)**: Inspects rolling block history. If 2+ consecutive passenger trains over 45+ minutes experience high $STR$, reclassify as `STATIC_TSR_OR_SIGNAL_FAULT` (a slow freight rake clears in 15–30 mins; a maintenance TSR persists for days).
- **Gate D (Weather Discount Gate)**: Raises threshold to $STR \ge 1.70$ when rainfall exceeds $15.0\text{ mm/hr}$.
- **Bayesian Prior Fusion**: Combines $STR$ with industrial freight priors (0.85 at Jakhapura, Nergundi, Barang coal chord; 0.15 elsewhere) to compute final probability.

### Stage 3: Priority Overtake & Loop-Line Discrete-Event Simulator
- Steps forward in 5-minute increments over the next 180 minutes.
- **Catch-Up Detection**: Checks if a trailing higher-priority train (e.g. *22895 Vande Bharat*, Rank 1) is closing in on a delayed train (*12821 Dhauli Express*, Rank 2) within a 10-minute headway safety window.
- **Loop Line Capacity Check**: Verifies loop availability at the upcoming station (`passenger_loops_dn > occupied_loops`).
- **Loop Hold Penalty**: Injects turnout deceleration (6 mins) + overtake pass time + starter signal clearance (5 mins) = **16–18 mins standard hold**.
- **Double-Overtake Check**: Re-evaluates loop release time against subsequent trailing expresses within 10 minutes, preventing trains from prematurely pulling onto the mainline.
- **Explainable Causal Cards**: Emits human-readable explanation objects detailing the exact station, added delay, and overtaking train.

### Stage 4: Timetable Slack Subtraction Floor & LightGBM Quantile CQR
- **Terminal Slack Subtraction**: Sums timetable padding approaching terminal hubs (e.g., Khurda Road / Puri).
- **Intermediate 0-Delay Floor**: Total projected delay can never drop below 0 minutes at intermediate halts (a train cannot depart earlier than its published schedule).
- **Weather / Congestion Efficiency Cap**: Slack recovery is capped at 75% when tracks are wet ($\text{rain} > 10\text{ mm/hr}$) or congested ($\text{freight\_prob} > 0.60$).
- **LightGBM Conformalized Quantile Regression (CQR)**:
  - Three boosters trained on asymmetric Pinball Loss ($\alpha \in \{0.10, 0.50, 0.90\}$) predict contextual residual uncertainty bands.
  - **Monotonic Non-Crossing Guard**: Enforces $P_{10} \le P_{50} \le P_{90}$ with a distance-scaled minimum uncertainty spread floor:
    $$\text{spread}_{\min} = \max(3.0, \text{remaining\_km} \times 0.06)$$

### Stage 5: Asymmetric Safe-Boarding Guardrail & Multimodal Rescue Engine
- **Safe-Boarding Lock (Pre-Boarding Passenger)**:
  - When passenger status is `PRE_BOARDING`, the engine locks guidance strictly to the official scheduled departure time:
    > *"Report to your boarding station on official schedule. Upstream slack recovery can eliminate delays; multimodal road bailout is locked until you are actively onboard."*
- **Early-Junction Road Transfer (On-Board Passenger)**:
  - Triggers strictly when connection survival drops below **40%** at the destination.
  - Searches upcoming commercial junctions with $\ge 5\text{ mins}$ passenger reaction time.
  - Queries **Tier 1 (Mapbox Live)** ➔ **Tier 2 (OSRM Live)** ➔ **Tier 3 (Calibrated Highway Matrix Fallback)**:
    $$\text{Road Arrival} = T_{\text{train\_arr}}^{\text{junction}} + \text{Exit Penalty (12m)} + (\text{Drive Time} \times \text{Peak Traffic Multiplier})$$
  - Proposes road bailout only if it saves $\ge 10\text{ mins}$ over rail and reliably catches the connection cutoff.

---

## 🎯 Calibrated Demonstration Scenario: Dhauli Express 12821

The system includes a pre-calibrated, deterministic demonstration scenario matching official Indian Railways timetable specifications:

```
[Bhadrak 0.0 km] ───────── [Jajpur 44.0 km] ───────── [Cuttack 115.0 km] ──(NH-16 Cab: 38m)──> [Bhubaneswar 143.0 km]
                                                               │                                      ▲
                                                       [Barang 128.0 km]                              │
                                                       • Loop Hold (+16m) for Vande Bharat 22895      │
                                                       • Phantom Freight Shadow Drag (+20m)           │
                                                               └── Rail Journey Misses Deadline ──────┘
```

1. **Initial State (10:58 AM IST)**:
   - **12821 Dhauli Express** is halted at **Cuttack Junction (CTC)** with an initial delay of **+28 mins**.
   - Connecting train at Bhubaneswar (BBS) departs at **12:15 PM** (effective cutoff with 15-min transfer buffer is **12:00 PM**).
2. **Rail Cascade (If Passenger Stays on Train)**:
   - 10:58 AM + 5m dwell + 28m run + 16m loop hold at Barang for 22895 Vande Bharat overtake + 20m freight drag behind Talcher coal rake = **12:38 PM Arrival (P50)**.
   - **Connection Missed** by 23 minutes (Survival Probability = **18%**, High Risk Miss).
3. **Road Rescue Arbitrage (Deboarding at Cuttack)**:
   - Deboard at Cuttack (10:58 AM) + 10m station exit & cab boarding + 38m drive via NH-16 Expressway = **11:46 AM Arrival at Bhubaneswar**.
   - **Connection Caught** with 14 minutes to spare (**Saves 52 minutes** compared to staying on the congested train).

---

## 🖥️ Frontend Experience: WIMT Story & 60 FPS WebGL Digital Twin

The frontend is built with **React 19**, **Vite**, **TypeScript**, **Tailwind CSS v4**, **Zustand**, and **MapLibre GL v5**, featuring a clean **Modern Transit Pale-White UI**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [RAIL-PULSE]  [12821 Dhauli (+28m)] [22895 Vande Bharat]  [ At Home | On Board ]  ⚡   │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│ 🛡️ Safe-Boarding Lock / NH-16 Rescue Card│ 🗺️ CORRIDOR DIGITAL TWIN (60 FPS WebGL)     │
│ [Deboard at Cuttack ➔ NH-16 Cab (11:46)] │   • Mapbox Light-v11 / OSM Vector Basemap   │
│                                          │   • High-Contrast Track Casing              │
│ ⏱️ ETA RANGE BAR (Bhubaneswar BBS)       │   • Amber Pulsing Freight Shadow at Barang  │
│ Expected: 12:38 PM (+28m)                │   • Dashed Emerald NH-16 Road Bailout Route │
│ [ P10: 12:24 |== P50: 12:38 ==| P90: 12:56 ]│   • Real-Time Moving Trains (rAF Lerp)  │
│                 │ DEADLINE: 12:15 PM     │   • Station Nodes & Interactive Tooltips    │
│                                          │                                             │
│ 📊 Connection Survival Gauge: 18% (HIGH) │ ⚙️ PRESENTER CONTROLS (Shift+D)             │
│                                          │   • Clock Speed: 1x / 10x / 30x             │
│ 🚆 "WHERE IS MY TRAIN" VERTICAL TIMELINE │   • Disruption Delay Injector (+5m to +60m) │
│ • Bhadrak (BHC, km 0.0) ✔ Passed         │   • Inject Freight Shadow / Reset Corridor  │
│ • Jajpur K. Rd (JJKR, km 44.0) ✔ Passed  │   • Enterprise ULIP FOIS Webhook Trigger    │
│   [ 3 intermediate automatic blocks ▾ ]  │                                             │
│ • Cuttack Jn (CTC, km 115.0) 📍 (Train Here)│                                          │
│   ⚠️ Phantom Freight Shadow Ahead (km 94)│                                             │
│   🛑 Loop Hold: Vande Bharat Overtake    │                                             │
│ • Bhubaneswar (BBS, km 143.0) 12:38 PM   │                                             │
│ • Puri Terminus (PURI, km 206.0) 14:20 PM│                                             │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

- **Two-Lane 60 FPS GPU Animator**: The WebSocket client receives 1.5s coordinate packets, which are fed into a `requestAnimationFrame` cosine-easing lerp loop that streams directly to MapLibre's WebGL GeoJSON source without triggering React re-renders.
- **Presenter / Judge Drawer**: Press <kbd>Shift + D</kbd> to open live disruption controls (time-warp speed 1x/10x/30x, custom delay sliders, and instant reset).

---

## 📊 50-Run Benchmark Scorecard

Evaluated using `ml/run_backtest.py` on 50 representative corridor cascade trips comparing the **Naive NTES Baseline** against **RAIL-PULSE**:

| Metric | Naive NTES Baseline | **RAIL-PULSE Cascade Engine** | Improvement |
| :--- | :--- | :--- | :--- |
| **Mean Absolute Error (MAE)** | 10.59 mins | **4.90 mins** | **53.7% Error Reduction** (Target: >50%) |
| **Root Mean Squared Error (RMSE)** | 15.20 mins | **6.25 mins** | **58.9% Variance Reduction** |
| **$P_{10} - P_{90}$ Empirical Coverage** | 0.0% (Single Timestamp) | **96.0%** | **Exceeds 80% Calibration Threshold** |
| **Average End-to-End Latency** | — | **< 38 ms** | Sub-40ms Production Target Met |

---

## 🛡️ The 14 Handled Edge Cases & Mitigation Matrix

| # | Edge Case / Failure Mode | Naive System Behavior | **RAIL-PULSE Engineering Mitigation** |
| :--- | :--- | :--- | :--- |
| **1** | Non-Stop Station Bailout | Recommends jumping off a non-stop express | Filters `is_commercial_halt == True` before recommending rescue station |
| **2** | Quantile Inversion ($P_{50} > P_{90}$) | Broken range bars on UI | Post-inference monotonic sorting + distance-scaled uncertainty spread floor |
| **3** | UP vs DN Track Mixing | Southbound freight triggers false alert for northbound train | Strict directional partitioning (`direction IN ('DN', 'UP')`) |
| **4** | Static TSR Mistaken for Freight | Speed restriction triggers endless "Ghost Freight" alerts | Checks rolling block history; 2+ consecutive trains reclassify to `STATIC_TSR` |
| **5** | Station Dwell Inflating STR | 15-min halt looks like slow block traversal | Computes $STR$ strictly on $(T_{\text{arr}}^{\text{next}} - T_{\text{dep}}^{\text{prev}})$, excluding halt dwell |
| **6** | Midnight Timestamp Rollover | Crossing midnight yields $-1390\text{ min}$ delta | Normalizes all day offsets into UTC Unix epoch integers with `ZoneInfo("Asia/Kolkata")` |
| **7** | Terminal Slack Over-Subtraction | Early arrival predicted at intermediate halt | Enforces 0-min delay floor at commercial halts; caps slack efficiency at 75% |
| **8** | Cascaded Double Overtake | Releasing train into path of second express | Evaluates loop release time against subsequent trailing expresses within 10m window |
| **9** | Loop Line Capacity Exhaustion | Over-books loop line at full station | Checks loop capacity; pushes overtake to next loop-equipped station |
| **10** | Pre-Boarding Liability Lock | Unboarded passenger misses recovering train | Safe-Boarding Rule locks pre-boarding users to schedule; bailout requires `ON_BOARD` |
| **11** | OSRM / Mapbox API Timeout | Rescue endpoint hangs or crashes | 2.0s timeout with fallback to `LocalRoadMatrixFallback` + 12m station exit penalty |
| **12** | WebSocket Fan-Out Bottleneck | Slow client stalls broadcast loop | Concurrent fan-out via `asyncio.gather` with 1.0s timeout per client |
| **13** | Event Loop Starvation | Heavy ML inference freezes heartbeats | Offloads ML prediction and discrete-event simulation to `asyncio.to_thread` |
| **14** | Venue Wi-Fi / API Blackout | Demo crashes in hall with bad internet | Self-contained zero-dependency mode using local JSON topology & offline LightGBM weights |

---

## 📂 Repository Structure

```
rail-pulse/
├── app/
│   ├── main.py                     # FastAPI lifespan, router mounting, static SPA serving
│   ├── config.py                   # Pydantic Settings (env vars, thresholds, corridor bounds)
│   ├── api/
│   │   ├── deps.py                 # Dependency injection providers (StateStore, Topology, Demo)
│   │   ├── ws.py                   # /ws/corridor non-blocking WebSocket stream manager
│   │   └── v1/
│   │       ├── health.py           # GET /api/v1/health (DB, Redis, ML status)
│   │       ├── corridor.py         # GET /corridor/topology, /corridor/state, /corridor/config
│   │       ├── forecast.py         # GET /trains/{train_no}/forecast, POST /predict-cascade
│   │       ├── rescue.py           # POST /rescue/evaluate
│   │       ├── webhooks.py         # POST /webhooks/ulip-fois (Authenticated enterprise endpoint)
│   │       └── demo.py             # POST /demo/scenario/start, /inject-delay, /inject-freight, /reset
│   ├── core/
│   │   ├── database.py             # Async SQLAlchemy PostGIS session + Local JSON Fallback
│   │   ├── redis_client.py         # redis.asyncio connection pool with circuit-breaker fallback
│   │   └── state_store.py          # In-Process Thread/Async-Safe CorridorStateStore
│   ├── engine/
│   │   ├── chainage_mapper.py      # GPS-to-1D chainage projection, dwell separation, headways
│   │   ├── freight_shadow.py       # 4-gate kinematic STR inference + TSR disambiguator
│   │   ├── overtake_sim.py         # Forward discrete-event loop overtake simulator + Causal Cards
│   │   ├── slack_adjuster.py       # Sectional timetable slack subtraction with 0-min floor
│   │   ├── quantile_ml.py          # LightGBM CQR quantile inference + non-crossing guard
│   │   ├── survival_math.py        # Two-Piece Normal CDF connection survival probability
│   │   └── rescue_engine.py        # Safe-Boarding Lock + Mapbox/OSRM multimodal road hop router
│   ├── ingestion/
│   │   ├── base.py                 # CorridorDataProvider ABC
│   │   ├── demo_provider.py        # Deterministic ECoR time-warp simulation provider
│   │   ├── live_poller.py          # 120s live station board & Open-Meteo weather fetcher
│   │   └── ulip_connector.py       # ULIP FOIS enterprise freight connector
│   └── models/
│       ├── db_models.py            # SQLAlchemy + GeoAlchemy2 PostGIS database tables
│       └── schemas.py              # Pydantic v2 data validation contracts
├── data/
│   ├── seed_ecor_topology.json     # Geographically verified 9 stations & 16 track blocks
│   ├── seed_osrm_matrix.json       # Pre-cached highway route geometries (NH-16 CTC->BBS)
│   └── fallback_snapshots.json     # Offline corridor snapshots for zero-Wi-Fi resilience
├── ml/
│   ├── artifacts/                  # Pre-trained LightGBM CQR quantile models (p10, p50, p90)
│   ├── generate_training_data.py   # Synthetic 5,000-trip ECoR delay cascade generator
│   ├── train_lightgbm.py           # Pinball quantile trainer with CQR conformal calibration
│   └── run_backtest.py             # 50-run benchmark comparing NTES vs RAIL-PULSE
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/             # TopHeader.tsx, DemoDrawer.tsx
│   │   │   ├── timeline/           # VerticalTimeline.tsx, StationRow.tsx, HazardTrackPill.tsx, EtaRangeBar.tsx
│   │   │   ├── rescue/             # ConnectionGuard.tsx, RescueBanner.tsx, CabModal.tsx
│   │   │   └── map/                # CorridorMap.tsx, MapLegend.tsx, useTrainAnimator.ts
│   │   ├── services/               # api.ts, wsClient.ts, mockFallback.ts
│   │   ├── stores/                 # useRailStore.ts (Zustand state store)
│   │   ├── types/                  # corridor.ts (TypeScript interface contracts)
│   │   ├── App.tsx                 # Responsive split-pane dashboard shell
│   │   └── main.tsx                # React 19 application entry point
│   ├── package.json                # React 19, MapLibre GL v5, Zustand v5, Lucide React
│   ├── vite.config.ts              # Vite config proxying /api and /ws to backend
│   └── dist/                       # Production compiled static assets
├── scripts/
│   └── seed_database.py            # PostgreSQL / PostGIS database migration CLI
├── tests/                          # 41 unit & integration tests (100% passing)
├── docker-compose.yml              # PostGIS 16 + Redis 7 + RAIL-PULSE multi-container stack
├── Dockerfile                      # Production container build
└── pyproject.toml                  # Python packaging & Ruff linting configuration
```

---

## 🚀 Quickstart & Installation Guide

### Prerequisites
- **Python 3.11+** (Python 3.13 tested)
- **Node.js 18+** & **npm** (for building frontend assets)
- **Docker & Docker Compose** (optional, for PostGIS & Redis containers)

### 1. Clone & Set Up Environment
```bash
git clone https://github.com/wicked-heckers/rail-pulse.git
cd rail-pulse

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install backend dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:
```ini
PROJECT_NAME=RAIL-PULSE
ENVIRONMENT=development
PORT=8000
HOST=0.0.0.0
WORKERS=1

# Optional live integrations (defaults to offline zero-Wi-Fi mode if omitted)
DATABASE_URL=postgresql+asyncpg://railpulse:railpulse_secret@localhost:5432/railpulse_db
REDIS_URL=redis://localhost:6379/0
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
ULIP_API_KEY=railpulse-enterprise-ulip-key
```

### 3. Build Frontend Assets
```bash
cd frontend
npm install
npm run build
cd ..
```

### 4. Launch the Server
```bash
# Start FastAPI application
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open **[http://localhost:8000/](http://localhost:8000/)** in your browser.

### 5. Running via Docker Compose
To launch the full stack with dedicated PostGIS and Redis containers:
```bash
docker compose up -d --build
```

### 6. Run Tests & Benchmark
```bash
# Run complete test suite (41 tests)
pytest tests/

# Run 50-run corridor cascade benchmark
python ml/run_backtest.py
```

---

## 📡 REST API & WebSocket Reference

### Core Endpoints (`/api/v1`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service health status, active provider mode, and ML model status |
| `GET` | `/api/v1/corridor/topology` | GeoJSON FeatureCollection of stations, tracks, and freight merge chords |
| `GET` | `/api/v1/corridor/state` | Current snapshot of active trains, freight shadows, and weather |
| `GET` | `/api/v1/trains/{train_no}/forecast` | Full P10/P50/P90 quantile forecast, Causal Cards, and loop overtake schedule |
| `POST` | `/api/v1/rescue/evaluate` | Evaluates connection survival and early-junction road bailout |
| `POST` | `/api/v1/predict-cascade` | Unified Section 7.2 prediction contract combining forecast, overtakes, and bailout |
| `POST` | `/api/v1/webhooks/ulip-fois` | Ingests confirmed enterprise freight telemetry (`X-ULIP-API-Key` protected) |

### Demo & Disruption Lab Endpoints (`/api/v1/demo`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/demo/scenario/start` | Resets corridor to deterministic judge demonstration scenario |
| `POST` | `/api/v1/demo/inject-delay` | Injects additional delay minutes on a target train |
| `POST` | `/api/v1/demo/inject-freight` | Spawns an unscheduled freight shadow on a specific track block |
| `POST` | `/api/v1/demo/speed` | Sets simulation clock multiplier (`1x`, `10x`, `30x`) |
| `POST` | `/api/v1/demo/reset` | Resets all delays and freight blockages to nominal timetable |

### WebSocket Streaming
- **URL**: `ws://localhost:8000/ws/corridor`
- **Interval**: Broadcasts every **1.5 seconds** (or on state change).
- **Payload**: Full corridor snapshot containing train kinematic state vectors, active phantom freight blocks, and weather conditions.
- **Heartbeat**: Send `{"ping": 1}` to receive `"pong"`.

---

## 📜 License & Acknowledgements
- Developed for **HackNation 6.0** under the Artificial Intelligence & Open Innovation tracks.
- Benchmarked against **Smart India Hackathon Problem Statement SIH26028**.
- Built with love for **Indian Railways commuters** and East Coast Railway travelers.
- Released under the **MIT License**.
