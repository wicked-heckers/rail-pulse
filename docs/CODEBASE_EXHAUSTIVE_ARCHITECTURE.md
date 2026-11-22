# RAIL-PULSE: Brutally Honest Codebase Audit, Current State & Future Roadmap

> **Author**: Technical Architecture Team  
> **Date**: November 2026  
> **Document Purpose**: An objective, transparent technical audit of the RAIL-PULSE repository. This document details **exactly what is implemented today**, **what is currently simulated or running on local fallbacks**, **what external services and APIs remain to be integrated**, and a **step-by-step engineering roadmap** for future production development.

---

## 1. Executive Reality Check: What This Codebase Is and Isn't

To build a reliable roadmap, we must be completely candid about the current state of this software:

| Dimension | Current Reality (What We Have Today) | Production Target (What We Must Build) |
| :--- | :--- | :--- |
| **Real-World Live Feeds** | ⚠️ **100% Simulated**: Driven by `DemoSimulationProvider` and synthetic scenarios. | Real-time CRIS / COA API, RTIS locomotive GPS feed, or NTES streaming poller. |
| **Mapping & Routing** | ⚠️ **Static JSON Seed**: Road travel times come from a pre-calculated static matrix (`seed_osrm_matrix.json`) or Haversine math. | Live Google Maps Distance Matrix / Directions API, Mapbox, or self-hosted live OSRM server with traffic. |
| **Caching & Message Broker** | ⚠️ **In-Memory Python Dict**: Redis code exists, but runs on an in-memory fallback dict because no Redis instance is hooked up. | Production Redis cluster for distributed caching, session state, and multi-worker WebSocket Pub/Sub. |
| **Database & Persistence** | ⚠️ **Static JSON Topology**: SQLAlchemy PostGIS models exist, but run on zero-dependency JSON fallback files (`seed_ecor_topology.json`). | Managed PostgreSQL + PostGIS instance with Alembic migrations and persistent delay event logging. |
| **Machine Learning** | ⚠️ **Synthetic Data Only**: LightGBM models (`p10.txt`, `p50.txt`, `p90.txt`) trained on 5,000 synthetic rows from our own generator. | Trained on 12+ months of real Indian Railways historical COA/NTES train movement logs. |
| **External AI / LLMs** | ⚠️ **None**: Zero external AI models (OpenAI, Claude, Gemini) are hooked up. | Potential future integration for passenger disruption notifications or natural-language operational alerts. |
| **Frontend Application** | ⚠️ **Vanilla JS Prototype**: Single-file HTML/CSS/JS (`index.html`, `app.js`) with CDN Tailwind and Leaflet. | Production component-based app (Next.js / React / TypeScript) with mobile PWA and user auth. |

---

## 2. Exhaustive Inventory of Current Code & How It Works

Despite being an offline prototype without external APIs hooked up, the **mathematical and kinematic logic is 100% complete, tested, and working**.

```
rail pulse/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── corridor.py       # Queries topology & block occupancy
│   │   │   ├── demo.py           # Simulation speed & delay perturbation endpoints
│   │   │   ├── forecast.py       # Core prediction endpoints (/forecast & /predict-cascade)
│   │   │   ├── health.py         # Liveness & readiness probes
│   │   │   ├── rescue.py         # Multimodal road bailout evaluation
│   │   │   └── webhooks.py       # FOIS freight webhook receiver
│   │   ├── deps.py               # Dependency injection
│   │   └── ws.py                 # 1.5s WebSocket broadcast stream
│   ├── config.py                 # Configuration settings (Pydantic BaseSettings)
│   ├── core/
│   │   ├── database.py           # Async SQLAlchemy engine with JSON fallback
│   │   ├── redis_client.py       # Circuit-breaker Redis client with in-memory fallback
│   │   └── state_store.py        # Thread-safe in-process atomic corridor state
│   ├── engine/
│   │   ├── chainage_mapper.py    # 1D track projection, GPS snapping & headways
│   │   ├── freight_shadow.py     # Section Traversal Ratio (STR) & exclusion gates
│   │   ├── overtake_sim.py       # Chronological overtake sweep & loop line holds
│   │   ├── quantile_ml.py        # Local LightGBM inference & non-crossing guard
│   │   ├── rescue_engine.py      # Early-junction road bailout & Safe-Boarding Lock
│   │   └── slack_adjuster.py     # Weather-adjusted slack subtraction & zero-floor
│   ├── ingestion/
│   │   ├── base.py               # Abstract BaseIngestionProvider interface
│   │   ├── demo_provider.py      # Deterministic simulation with time-warp
│   │   ├── live_poller.py        # Polling interface stub for live feeds
│   │   └── ulip_connector.py     # Freight rake webhook handler
│   ├── models/
│   │   ├── db_models.py          # SQLAlchemy PostGIS ORM schemas
│   │   └── schemas.py            # Pydantic V2 input/output validation models
│   └── main.py                   # FastAPI app setup, static mounting & lifespan
├── data/
│   ├── ecor_cascade_training_data.csv # 5,000 synthetic delay cascade rows
│   ├── fallback_snapshots.json        # Snapshot data for offline fallback
│   ├── seed_ecor_topology.json        # 9 stations, blocks, MPS limits, loops
│   └── seed_osrm_matrix.json          # Static Cuttack-Bhubaneswar road matrix
├── frontend/
│   ├── index.html                # Pale-white minimalist UI
│   └── static/
│       ├── app.js                # Frontend client logic, Leaflet & canvas
│       └── style.css             # Light theme styling & animations
├── ml/
│   ├── artifacts/
│   │   ├── p10.txt               # Local LightGBM 10th percentile model (~132 KB)
│   │   ├── p50.txt               # Local LightGBM 50th percentile model (~134 KB)
│   │   └── p90.txt               # Local LightGBM 90th percentile model (~135 KB)
│   ├── generate_training_data.py # Correlated IR cascade data generator
│   ├── run_backtest.py           # 50-run backtest benchmark script
│   └── train_lightgbm.py         # LightGBM training script
├── scripts/
│   └── seed_database.py          # Standalone CLI seeder for PostgreSQL/PostGIS
└── tests/                        # 38 Passing Unit and Integration Tests
```

---

## 3. Deep Dive into Implemented Modules

### 3.1. Pure Physics & Kinematics (`app/engine/`)

These files contain **zero external calls**. They are pure Python algorithms:

1. **`chainage_mapper.py`**:
   - Maps $(lat, lon)$ GPS coordinates to a 1D corridor distance $s \in [0.0, 206.0]\text{ km}$ from Bhadrak (`BHC`) to Puri (`PURI`).
   - Uses Haversine spherical geometry to snap off-track GPS pings to the nearest track block.
   - Separates observed station halt time into scheduled timetable dwell vs. excess commercial dwell.
   - Calculates true physical headways between consecutive trains moving in the same direction (`DN` or `UP`).
2. **`freight_shadow.py`**:
   - Computes Section Traversal Ratio ($\text{STR} = T_{\text{actual}} / T_{\text{sectional}}$) to detect unreported freight trains (e.g. 58-wagon coal rakes from Talcher coalfields).
   - Applies 4 physical exclusion gates:
     - *Gate A*: Speed $> 65\text{ km/h}$ invalidates freight shadow (freight cannot travel that fast).
     - *Gate B*: Preceding passenger train presence invalidates phantom freight (it's coaching congestion).
     - *Gate C*: Known engineering speed restrictions (TSR) filtered out.
     - *Gate D*: Enforces 750m goods loop clearance time ($T_{\text{clear}} \approx 3.6$ to $4.0\text{ min}$) or 20-minute manual hold if confirmed via ULIP FOIS.
3. **`overtake_sim.py`**:
   - Evaluates closing speed between trains ($v_{\text{rel}} = v_{\text{chaser}} - v_{\text{target}}$).
   - Simulates holding lower-priority trains (e.g. `12821 Dhauli Express`) on loop sidings (Cuttack Junction Loop Line 2) to let high-priority trains (e.g. `22895 Vande Bharat`) pass on the mainline.
   - Handles cascaded double overtakes without deadlock and emits structured Causal Cards.
4. **`slack_adjuster.py`**:
   - Subtracts published schedule slack buffers to prevent linear delay extrapolation.
   - Applies weather discounts ($\eta = 0.75$ in dry conditions, dropping to $0.40$ in fog/rain).
   - Enforces the Indian Railway operating rule: **a train can never depart an intermediate commercial station earlier than published time**, clamping projected delay to a zero floor ($\max(0.0, \text{Delay})$).
5. **`rescue_engine.py`**:
   - Evaluates Cuttack $\to$ Bhubaneswar highway bailout via NH-16 (28.4 km road vs 28.0 km rail).
   - Implements the **Safe-Boarding Lock**: if the passenger is unboarded at home, road bailout is suppressed to avoid liability if the train accelerates and recovers slack.

### 3.2. Machine Learning Quantile Models (`ml/` & `app/engine/quantile_ml.py`)

- **What they are**: Three lightweight LightGBM decision tree boosters stored as plain text files (`p10.txt`, `p50.txt`, `p90.txt`).
- **What they do**: Given kinematic features (current delay, headway, freight shadow presence, distance remaining), they output the 10th, 50th, and 90th percentile arrival times.
- **Guardrails**: `quantile_ml.py` enforces $P_{10} \le P_{50} \le P_{90}$ with distance-scaled minimum spread floors.
- **Current Limitation**: Trained on 5,000 synthetic rows generated by `generate_training_data.py`. They validate that the pipeline and non-crossing mathematics work, but **they have not seen real-world Indian Railways historical logs yet**.

### 3.3. State Management & Ingestion (`app/core/`, `app/ingestion/`)

- **`state_store.py`**: A thread-safe, in-memory state dictionary protected by an `asyncio.Lock()`. Tracks train positions, injected delays, and simulation ticks.
- **`redis_client.py`**: Has connection logic for Redis, but immediately falls back to local memory if `redis://` is not reachable.
- **`demo_provider.py`**: Advances the simulation clock (1x, 10x, 30x) and moves trains along the track according to static timetable schedules.

### 3.4. API & WebSocket Layer (`app/api/`)

- Built with **FastAPI**.
- Exposes REST endpoints for querying GeoJSON corridor topology, running forecasts, evaluating bailout plans, and injecting demo delays.
- WebSocket `/ws/corridor` streams JSON state ticks every 1.5 seconds.

### 3.5. Frontend Client (`frontend/`)

- Single-page application built with HTML5, vanilla JavaScript (`app.js`), custom CSS (`style.css`), and Tailwind CDN.
- Leaflet map rendering CartoDB Positron open tiles.
- Space-time trajectory rendered on an HTML5 `<canvas>`.
- Interactive slide-over drawer for delay simulation.

---

## 4. Brutally Honest Gap Analysis: What Must Be Added

To transform this mathematical prototype into a true enterprise production system, the following **7 major technical gaps** must be addressed:

```mermaid
flowchart TD
    subgraph Current_Prototype ["Current Prototype (Self-Contained / Mocked)"]
        A1["Static JSON Matrix (seed_osrm_matrix.json)"]
        A2["In-Memory Python State Dictionary"]
        A3["Static JSON Topology (seed_ecor_topology.json)"]
        A4["Simulated Clock (DemoSimulationProvider)"]
        A5["Synthetic LightGBM (5,000 synthetic rows)"]
        A6["Vanilla JS (Single-file app.js)"]
        A7["Zero External AI / LLMs"]
    end

    subgraph Production_Target ["Required Integrations for Production"]
        B1["Live Map / Routing API (Google Maps / Mapbox / OSRM Server)"]
        B2["Live Redis Cluster (Pub/Sub & Shared Hot Cache)"]
        B3["Managed PostgreSQL + PostGIS (Alembic Migrations)"]
        B4["Live Indian Railways Feeds (CRIS COA / RTIS GPS / FOIS)"]
        B5["Real Historical Data ML Pipeline (12+ Months COA Logs)"]
        B6["Modern Component Frontend (Next.js / React / TypeScript PWA)"]
        B7["Operational AI Agent (Natural Language Disruption Briefs)"]
    end

    A1 -.->|Must Replace With| B1
    A2 -.->|Must Replace With| B2
    A3 -.->|Must Replace With| B3
    A4 -.->|Must Replace With| B4
    A5 -.->|Must Replace With| B5
    A6 -.->|Must Replace With| B6
    A7 -.->|Optional Addition| B7
```

### Gap 1: Live Mapping & Road Routing APIs
* **Current State**: Road distance and drive time from Cuttack Junction to Bhubaneswar (28.4 km, 38 mins) are hardcoded in `seed_osrm_matrix.json`.
* **What is Missing**:
  - Live traffic congestion integration (peak morning/evening rush on NH-16 can push drive times from 38 mins to 65 mins).
  - Integration with **Google Maps Distance Matrix API**, **Mapbox Directions API**, or a self-hosted **OSRM routing container** with OpenStreetMap road data.
  - Integration with ride-hailing APIs (Uber / Ola deep-linking or ride estimate webhooks).

### Gap 2: Production Redis Cache & Message Broker
* **Current State**: Redis client code exists in `redis_client.py`, but runs on an in-memory fallback dict because no Redis instance is configured in local development.
* **What is Missing**:
  - A real Redis 7+ instance configured in `.env`.
  - Redis Pub/Sub backend for FastAPI WebSockets so multiple Uvicorn worker processes can broadcast train updates without state desynchronization.
  - Redis JSON / RedisTimeSeries for hot telemetry caching.

### Gap 3: Production Database & PostGIS Setup
* **Current State**: PostGIS SQLAlchemy ORM models exist in `db_models.py`, but database calls currently fall back to reading static JSON fixtures (`seed_ecor_topology.json`).
* **What is Missing**:
  - A real PostgreSQL 16 + PostGIS 3.4 database hooked up via `.env`.
  - Alembic database migration scripts for version-controlled schema upgrades.
  - Persistent tables storing historical delay events, train runs, and passenger rescue logs.

### Gap 4: Live Railway Ingestion Feeds
* **Current State**: The system runs entirely on `DemoSimulationProvider` which increments a synthetic epoch clock and calculates positions deterministically.
* **What is Missing**:
  - Connection to Indian Railways **CRIS (Centre for Railway Information Systems)** COA (Control Office Application) feeds.
  - Ingestion of live **RTIS (Real-Time Information System)** locomotive GPS pings.
  - Live production authentication and webhook signature verification for government **ULIP (Unified Logistics Interface Platform) FOIS** freight rake APIs.

### Gap 5: Real-World Historical ML Dataset
* **Current State**: LightGBM models (`p10.txt`, `p50.txt`, `p90.txt`) were trained on 5,000 synthetic rows generated by `ml/generate_training_data.py`.
* **What is Missing**:
  - Extracting 6 to 12 months of actual train movement logs for the ECoR Bhadrak–Puri corridor.
  - Real seasonal weather features (monsoon rainfall radar, winter fog visibility index).
  - An automated retraining and model evaluation pipeline using MLflow or DVC.

### Gap 6: Frontend Architecture Modernization
* **Current State**: A single `app.js` file (~550 lines) with vanilla DOM manipulation and Leaflet.
* **What is Missing**:
  - Modern component architecture: **Next.js 14+ / React 19** with **TypeScript**.
  - Proper client-side state management (Zustand or TanStack Query).
  - Responsive mobile Progressive Web App (PWA) with service workers, native push notifications, and live GPS passenger geofencing.

### Gap 7: Generative AI / Operational LLM Layer (Optional Enhancement)
* **Current State**: Zero AI models or LLM APIs are used.
* **Potential Future Value**:
  - A secure local LLM (e.g. quantized Llama 3 / Mistral via Ollama) or cloud LLM to translate raw causal event cards into personalized passenger SMS/WhatsApp messages in regional languages (Odia, Hindi, Bengali, English).
  - Automated operational shift-handoff summaries for railway section controllers.

---

## 5. Prioritized Future Development Roadmap

This phase-by-phase plan outlines the path from the current mathematical prototype to an enterprise production system.

```mermaid
gantt
    title RAIL-PULSE Production Engineering Roadmap
    dateFormat  YYYY-MM
    section Phase 1: Real Infra
    PostgreSQL & PostGIS Setup     :p1_1, 2026-12, 3w
    Alembic Migrations             :p1_2, after p1_1, 1w
    Redis Cluster & Pub/Sub        :p1_3, 2026-12, 2w
    section Phase 2: Live APIs
    Google Maps / OSRM Server API  :p2_1, 2027-01, 3w
    Weather API (Open-Meteo)       :p2_2, 2027-01, 1w
    Uber/Ola Ride Estimate Hook    :p2_3, after p2_1, 2w
    section Phase 3: Real Ingestion
    CRIS COA / NTES Poller         :p3_1, 2027-02, 4w
    ULIP FOIS Webhook Auth         :p3_2, 2027-02, 2w
    section Phase 4: Real ML
    Historical COA Data Ingestion  :p4_1, 2027-03, 3w
    LightGBM Retraining on Real Logs:p4_2, after p4_1, 2w
    section Phase 5: Modern Frontend
    Next.js / TypeScript Rewrite   :p5_1, 2027-04, 4w
    Mobile PWA & Push Alerts       :p5_2, after p5_1, 3w
```

### Phase 1: Infrastructure & Services Hookup (Target: Month 1)
1. **Provision Real PostGIS Database**:
   - Spin up PostgreSQL 16 with PostGIS in Docker or managed cloud (RDS/Supabase).
   - Configure `.env` with `DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/railpulse`.
   - Run `scripts/seed_database.py` against the real database to populate stations and track blocks.
   - Set up Alembic migrations (`alembic init migrations`).
2. **Hook Up Real Redis**:
   - Spin up Redis 7 (`REDIS_URL=redis://localhost:6379/0`).
   - Enable multi-worker Uvicorn (`--workers 4`) and test WebSocket broadcasting over Redis Pub/Sub channels.

### Phase 2: Live Mapping, Routing & Weather APIs (Target: Month 2)
1. **Live Road Routing Integration**:
   - Create a routing provider interface in `app/engine/rescue_engine.py`.
   - Integrate **Google Maps Directions API** or self-hosted **OSRM** with real-time traffic overlay.
   - Replace static road matrices with dynamic queries:
     ```python
     async def get_live_road_travel_time(origin_lat, origin_lon, dest_lat, dest_lon) -> RoadRoute: ...
     ```
2. **Live Weather API**:
   - Connect Open-Meteo or IMD (India Meteorological Department) weather API.
   - Feed live visibility (meters) and precipitation (mm/h) into `slack_adjuster.py` to dynamically compute weather efficiency $\eta_{\text{weather}}$.

### Phase 3: Live Ingestion & Railway Feeds (Target: Month 3)
1. **CRIS / NTES Connector**:
   - Implement `LiveFeedProvider` in `app/ingestion/live_poller.py`.
   - Poll NTES or CRIS COA streaming endpoints for train train movement records.
2. **Production ULIP FOIS Pipeline**:
   - Implement HMAC-SHA256 signature verification in `app/api/v1/webhooks.py` for government ULIP FOIS freight rake webhooks.

### Phase 4: Production ML Training on Historical Data (Target: Month 4)
1. **Historical Data Pipeline**:
   - Acquire 12+ months of real train movement logs across East Coast Railway.
   - Extract features: departure delay, sectional headway, preceding train category, weather conditions, day of week.
2. **Model Retraining & Validation**:
   - Retrain `p10`, `p50`, and `p90` LightGBM models on real ground-truth data.
   - Run `ml/run_backtest.py` to verify error metrics against actual railway operations.

### Phase 5: Modern Frontend & Mobile PWA (Target: Month 5)
1. **Next.js / TypeScript Migration**:
   - Convert `frontend/` into a modern **Next.js 14+ (App Router)** project.
   - Use TanStack Query for server state and Zustand for simulation parameters.
2. **Passenger PWA Features**:
   - Implement browser Geolocation API to detect whether the user is physically at the station or at home.
   - Integrate Web Push Notifications for urgent bailout alerts ("Deboard at Cuttack now to catch connecting train").

---

## 6. How to Run and Verify the Current Codebase

### Running Locally
```bash
# 1. Activate Python virtual environment
source .venv/bin/activate

# 2. Run the 38 unit and integration tests
pytest -v tests/

# 3. Start the FastAPI server with attached frontend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Accessing the System
* **Live Dashboard UI**: Open `http://localhost:8000` in your browser.
* **Interactive API Documentation (Swagger)**: Open `http://localhost:8000/docs`.
* **Corridor GeoJSON Endpoint**: `http://localhost:8000/api/v1/corridor/topology`.
* **Real-Time WebSocket Stream**: `ws://localhost:8000/ws/corridor`.

---

## 7. Summary

RAIL-PULSE has a **complete, mathematically verified, and fully tested kinematic physics core**. The algorithms for chainage mapping, freight shadow detection, loop line overtake simulation, slack buffer clamping, and multimodal bailout routing are completely implemented and pass all 38 tests.

However, **it is currently running on simulated feeds, static JSON fixtures, in-memory caches, and local synthetic ML models**. The roadmap above outlines the exact sequence required to hook up real PostGIS databases, production Redis clusters, live Google Maps/OSRM traffic routing, live CRIS/NTES feeds, and real-world historical training data.
