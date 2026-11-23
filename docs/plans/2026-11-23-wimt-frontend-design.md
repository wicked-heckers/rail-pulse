# RAIL-PULSE "Where is My Train" Frontend Design Document

**Date:** 2026-11-23  
**Status:** Approved  
**Author:** Antigravity Team  
**Reference Document:** `front end plan.md`

---

## 1. Executive Summary & Purpose

The RAIL-PULSE frontend transforms from a basic map dashboard into a **glanceable, high-contrast transit intelligence tool** modeled on the intuitive UX of *"Where is My Train"* (WIMT), upgraded with deep predictive corridor analytics:
- Real-time **P10 / P50 / P90** arrival uncertainty range bars pinned against connection deadlines.
- Inline track hazard pills showing **Phantom Freight Shadows** and **Priority Overtake Loop Holds**.
- **Safe-Boarding Guardrail** (`At Home` vs `On Board`) suppressing false-rescue liability before departure.
- A synced **MapLibre GL Digital Twin** powered by free vector basemaps (OpenFreeMap Positron) running at 60 FPS via direct WebGL interpolation without React re-render overhead.
- A hidden **Presenter / Judge Drawer** (`Shift + D`) to drive live 1x/10x/30x simulation speed and disruption injections.

---

## 2. Visual Design System

### 2.1 Modern Transit Palette
- **Canvas / Background:** Warm off-white/cream `#FAF9F6` (`bg-slate-50` / `#FAF9F6`).
- **Cards & Surfaces:** Pure crisp white `#FFFFFF` with `1px` subtle borders (`#E5E7EB`).
- **Signal Crimson (`#D92D20`):** Severe delays, high connection risk (<40% survival), Vande Bharat Express overtaking markers.
- **Freight Amber (`#D97706`):** Phantom freight shadow warnings, loop-line holds, and track cautions.
- **Rescue Emerald (`#059669`):** Safe connections (≥70%), on-time arrivals, and recommended NH-16 highway road-transfer routes.
- **Deep Ink (`#111827`) & Muted Slate (`#6B7280`):** Primary text and past completed stations.

### 2.2 Typography Rules
- **UI Labels:** `Inter` / system sans-serif.
- **Timestamps, Delays & Chainages:** `JetBrains Mono` with `font-variant-numeric: tabular-nums` to eliminate character jitter during live countdowns.
- **Human-First Microcopy:** Technical ML outputs are translated into plain language (e.g. "Likely 12:09 PM" instead of raw P50; "Ghost Freight Ahead (86%)" instead of STR index).

---

## 3. Component Architecture & Screen Blueprint

```
App.tsx
├── TopHeader.tsx (Train Selector, Speed, Delay Chip, At Home / On Board Toggle, Live Sync Pill)
├── MainWorkspace (Desktop: 42% / 58% Split; Mobile: Segmented View + Bottom Sheet)
│   ├── Left Pane: WIMT Vertical Story
│   │   ├── ConnectionGuard.tsx (Destination Station, Deadline Time, Survival Gauge)
│   │   ├── RescueBanner.tsx (Safe-Boarding Lock or Cuttack NH-16 Road Bailout Card)
│   │   ├── EtaRangeBar.tsx (Earliest P10 · Likely P50 · Worst P90 Horizontal Strip)
│   │   └── VerticalTimeline.tsx
│   │       ├── StationRow.tsx (Station Name, Platform, Scheduled/Projected Times, Checkmark)
│   │       ├── ActiveTrainPin.tsx (Animated Crimson Pill on current track segment)
│   │       └── HazardTrackPill.tsx (Inline Freight Shadow & Overtake Hold Expandable Cards)
│   └── Right Pane: Corridor Digital Twin
│       ├── CorridorMap.tsx (MapLibre GL Canvas, OpenFreeMap Positron + Offline Local Style)
│       ├── MapLegend.tsx (Glassmorphic Floating Control)
│       └── useTrainAnimator.ts (60 FPS requestAnimationFrame WebGL Interpolation)
└── DemoDrawer.tsx (Hidden Shift+D / Triple-Tap Presenter Drawer)
```

---

## 4. Two-Lane 60 FPS State & Animation Engine

1. **UI State Lane (Zustand — `useRailStore.ts`):**
   - Polls or listens to WebSocket `/ws/corridor` every 1.5s.
   - Manages selected train, connection target, survival probability, active causal cards, and UI drawer states.
   - Triggers React component re-renders strictly on 1.5s ticks.

2. **GPU Animation Lane (`useTrainAnimator.ts`):**
   - Maintains a mutable `trainTargetsRef` (`prevLat, prevLng, nextLat, nextLng, tickEpoch`).
   - Uses `requestAnimationFrame` to compute linear interpolation (`lerp`) across the 1.5s duration.
   - Pushes one single GeoJSON `FeatureCollection` directly into WebGL via `map.getSource('live-trains').setData(geojson)`.
   - Result: 60 FPS silky train movement with zero React re-renders.

---

## 5. Offline & Network Resilience
- **OpenFreeMap Positron Basemap:** Vector tiles from `https://tiles.openfreemap.org/styles/positron` (100% free, zero tokens, zero rate limits).
- **Offline Venue Fallback:** On tile error or network disconnect, falls back immediately to an inline minimalist local style (`#F5F3EE` canvas) with local GeoJSON track and station geometries intact.
- **WebSocket Reconnection:** Auto-reconnect with exponential backoff (`1s -> 2s -> 5s`) and amber status indicator (`"Reconnecting · Showing Cached Snapshot"`).

---

## 6. Verification & Test Strategy
- Unit tests for range bar mathematical scales and survival classification.
- Visual inspection on both mobile (390px) and desktop (1280px).
- End-to-end dry run of the calibrated SIH26028 demo case:
  1. Dhauli Express 28m delayed at Cuttack.
  2. Vande Bharat closing at 130 km/h.
  3. Freight shadow at Barang loop.
  4. At Home toggle locks rescue; On Board toggle unlocks Cuttack NH-16 cab rescue saving ~21 minutes.
