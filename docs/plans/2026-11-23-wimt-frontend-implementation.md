# Where is My Train (WIMT) Frontend Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use strict single-flow execution to implement this plan step by step. Track live status in `docs/plans/task.md`.

**Goal:** Build a high-contrast, glanceable "Where is My Train" style corridor intelligence web application in React 19, TypeScript, Tailwind CSS, and MapLibre GL, featuring real-time P10/P50/P90 range bars, inline track hazard pills, the Safe-Boarding Guardrail, and a 60 FPS GPU-accelerated corridor digital twin.

**Architecture:** Split into a 1.5s UI state lane powered by Zustand and an independent 60 FPS GPU animation lane powered by `requestAnimationFrame` lerping WebGL GeoJSON layers in MapLibre GL. Compiled into FastAPI static assets for single-command deployment.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS, Zustand, MapLibre GL, OpenFreeMap Positron, Lucide React.

---

### Task 1: Initialize Frontend Workspace & Tooling
**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Modify: `frontend/src/main.tsx`

**Step 1: Write `package.json` with React 19, Vite, Tailwind, Zustand, and MapLibre**
```json
{
  "name": "rail-pulse-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^1.16.0",
    "maplibre-gl": "^5.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.7.2",
    "vite": "^6.1.0"
  }
}
```

**Step 2: Run `npm install` in `frontend/`**
Run: `cd frontend && npm install`
Expected: Packages installed successfully.

---

### Task 2: Implement Corridor TypeScript Data Types
**Files:**
- Create: `frontend/src/types/corridor.ts`

**Step 1: Write exact TypeScript models mirroring FastAPI backend schemas**
Including:
- `TrainKinematicState`
- `StationArrival`
- `CausalCard`
- `ForecastResponse`
- `PredictCascadeResponse`
- `RescueEvaluationResponse`
- `CorridorSnapshot`

---

### Task 3: Implement Global Store & API Client
**Files:**
- Create: `frontend/src/stores/useRailStore.ts`
- Create: `frontend/src/services/api.ts`

**Step 1: Implement `useRailStore.ts` with Zustand**
Manages:
- `selectedTrain`: string ("12821")
- `passengerStatus`: "PRE_BOARDING" | "ON_BOARD"
- `activeSnapshot`: CorridorSnapshot | null
- `forecast`: ForecastResponse | null
- `rescue`: RescueEvaluationResponse | null
- `connectionTarget`: { station_code: "BBS", deadline_time: "12:15", buffer_mins: 15 }
- `drawerOpen`: boolean
- `isOnline`: boolean

**Step 2: Implement `api.ts` with typed async fetchers**
- `fetchTopology()`
- `fetchForecast(trainNo)`
- `fetchRescueEvaluation(payload)`
- `injectDelay(trainNo, mins)`
- `startDemoScenario(name, speed)`

---

### Task 4: Implement Resilient WebSocket Client & Mock Fallback
**Files:**
- Create: `frontend/src/services/wsClient.ts`
- Create: `frontend/src/services/mockFallback.ts`

**Step 1: Implement `wsClient.ts` with auto-reconnect**
- Exponential backoff (`1s -> 2s -> 5s`).
- Dispatches state updates into `useRailStore`.
- Emits connection status for UI status pills.

**Step 2: Implement `mockFallback.ts`**
- Seeded snapshot of Dhauli Express at Cuttack, Vande Bharat closing at 130 km/h, and active freight shadow at Barang so UI renders instantly offline.

---

### Task 5: Build Top Header & Navigation
**Files:**
- Create: `frontend/src/components/layout/TopHeader.tsx`

**Step 1: Implement Header component**
- Quick-Pick Train Selector Pills (`12821 Dhauli`, `22895 Vande Bharat`, `18410 Sri Jagannath`).
- Current speed & delay chip with high-contrast badge (`+28m late`).
- Segmented Safe-Boarding Toggle: `[ At Home ]` vs `[ On Board ]`.
- Live Sync status pill (`Live Sync 1.5s` / `Reconnecting`).

---

### Task 6: Build ETA Range Bar Component
**Files:**
- Create: `frontend/src/components/timeline/EtaRangeBar.tsx`

**Step 1: Implement `EtaRangeBar.tsx`**
- Prominent Likely ETA (`P50`) display.
- Visual horizontal range band:
  - Gradient strip spanning Earliest (`P10`) to Worst Case (`P90`).
  - Median diamond marker at `P50`.
  - Distinct vertical indicator for Connection Deadline.
  - Tabular JetBrains Mono numbers to prevent text jitter.

---

### Task 7: Build Connection Guard & Early-Junction Rescue Cards
**Files:**
- Create: `frontend/src/components/rescue/ConnectionGuard.tsx`
- Create: `frontend/src/components/rescue/RescueBanner.tsx`

**Step 1: Implement `ConnectionGuard.tsx`**
- Destination station picker (BBS, KUR, PURI).
- Deadline time picker and buffer slider.
- Connection survival gauge with color-coded risk meter (Green ≥70%, Amber 40-70%, Red <40%).

**Step 2: Implement `RescueBanner.tsx`**
- When `passengerStatus === "PRE_BOARDING"`: Renders Safe-Boarding Lock info banner advising passenger to reach station on time.
- When `passengerStatus === "ON_BOARD"` & `survival < 40%`: Renders high-contrast Emerald-bordered Cuttack NH-16 road transfer card with minutes saved (`~21m saved`), drive duration, and action button to highlight route on map.

---

### Task 8: Build Where is My Train Vertical Timeline
**Files:**
- Create: `frontend/src/components/timeline/VerticalTimeline.tsx`
- Create: `frontend/src/components/timeline/StationRow.tsx`
- Create: `frontend/src/components/timeline/HazardTrackPill.tsx`

**Step 1: Implement `VerticalTimeline.tsx`**
- Continuous vertical track rail running through all corridor stations.
- Completed past stops rendered with checkmark and muted opacity (`55%`).
- Collapsible intermediate non-stop blocks (`"3 intermediate blocks ▾"`).
- Automatically expands any block with an active hazard.

**Step 2: Implement `HazardTrackPill.tsx`**
- Inline amber `"⚠ Ghost Freight Ahead (86%)"` pill rendered directly on the track line.
- Inline crimson `"⇄ Priority Overtake Hold (+16m)"` pill.
- Expandable micro-explanation on tap.

---

### Task 9: Build 60 FPS MapLibre GL Digital Twin
**Files:**
- Create: `frontend/src/components/map/CorridorMap.tsx`
- Create: `frontend/src/components/map/useTrainAnimator.ts`
- Create: `frontend/src/components/map/MapLegend.tsx`

**Step 1: Implement `useTrainAnimator.ts`**
- 60 FPS `requestAnimationFrame` lerp loop between 1.5s WebSocket ticks.
- Direct GeoJSON update via `map.getSource('live-trains').setData()` without React re-renders.

**Step 2: Implement `CorridorMap.tsx`**
- OpenFreeMap Positron vector style (`https://tiles.openfreemap.org/styles/positron`).
- Offline fallback to minimalist canvas style (`#F5F3EE`) on network drop.
- Track geometry, station circles, pulsing amber freight segment, and dashed emerald NH-16 route.

---

### Task 10: Build Presenter / Judge Control Drawer
**Files:**
- Create: `frontend/src/components/layout/DemoDrawer.tsx`

**Step 1: Implement `DemoDrawer.tsx`**
- Keyboard shortcut `Shift + D` listener and header logo triple-tap.
- Speed multipliers: `1x`, `10x`, `30x`.
- Disruption injection buttons: `Start 28m Late Scenario`, `Inject Barang Freight`, `Simulate ULIP Override`, `Reset`.

---

### Task 11: Main Application Assembly & Responsive Layout
**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Implement responsive split-view**
- Desktop (`≥1024px`): Left 42% WIMT Timeline & Rescue Card; Right 58% MapLibre GL Corridor Radar.
- Mobile (`<1024px`): Top Segmented Switch (`Timeline` | `Live Radar`) with sticky header and bottom rescue sheet.

---

### Task 12: Production Build & FastAPI Integration
**Files:**
- Modify: `app/main.py`
- Test: Build output and verify on `http://localhost:8000`

**Step 1: Run `npm run build`**
- Output generated in `frontend/dist/`.

**Step 2: Update FastAPI to serve `frontend/dist`**
- Seamless integration with root endpoint `/` and `/assets`.

**Step 3: Verification & Test Suite**
- Run `pytest tests/` to confirm all 39 backend tests pass.
- Verify live browser view on desktop and mobile viewports.
