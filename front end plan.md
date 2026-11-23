## 1. UX Deep Dive: Why *Where is My Train* Works — And the RAIL-PULSE Twist

*Where is My Train* dominates Indian rail travel because it treats a train journey as a **glanceable vertical story** rather than a complex dashboard. When passengers are stressed on a moving train, they only want to answer two questions in under 3 seconds: **"Where am I right now?"** and **"When do I actually reach?"**

To match that simplicity while showcasing RAIL-PULSE's corridor intelligence, borrow *Where is My Train*'s core muscle memory and upgrade each pattern with one clear RAIL-PULSE layer:

| *Where is My Train* Pattern (Keep Familiar) | The RAIL-PULSE Upgrade (Your Differentiator) |
| --- | --- |
| **1-Tap Train Search & Quick Cards:** Enter a train number/name or tap a recent train to land directly on live status with zero login walls. | **Active Corridor Quick-Pick:** Open straight to live trains running on the Bhadrak–Cuttack–Bhubaneswar–Khurda Road–Puri corridor, plus a 1-tap demo card for judges.

 |
| **Vertical Station Timeline:** Past stops are muted/checked, current train icon dominates the track line, and intermediate non-stop stations collapse cleanly until tapped. | **Inline Corridor Hazards on the Track:** Directly on the vertical line *between* stations, render an amber **"Ghost Freight Ahead"** pill where a slowdown is inferred, and embed **Loop-Line Overtake Cards** right at the station where a faster train will pass you.

 |
| **Single Red Delay Timestamp:** Shows one scheduled time struck through with one estimated time next to it. | **Human-Readable Arrival Range Bar:** Displays the Expected (`P50`) time clearly with a compact horizontal range strip beneath it: **Earliest (`P10`) · Likely (`P50`) · Worst Case (`P90`)**, pinned against a vertical marker for your connection deadline.

 |
| **"Are You Inside This Train?" Toggle:** Famous switch at the bottom/top of the live tracking screen. | **Safe-Boarding Guardrail Toggle (`At Home` vs. `On Board`):** When set to **At Home**, the UI locks boarding advice to official railway departure time so nobody misses their train. Flipping to **On Board** unlocks the Connection Guard and Early-Junction Rescue alerts.

 |
| **Pure List View (No Spatial Context):** Great for one train, completely blind to traffic ahead or behind.

 | **Synced MapLibre Corridor Twin:** On mobile, a clean segmented control (`Timeline |

---

## 2. Visual Design System (Minimalist, High-Contrast, Zero Clutter)

Avoid dark-mode neon "mission control" dashboards—they look cluttered on bright hackathon projectors and are hard to read on phones inside sunlit train coaches. Use a crisp, high-contrast **Modern Transit** palette:

* **Surface Hierarchy:** Warm off-white/cream canvas (`#FAF9F6`) with crisp pure-white cards (`#FFFFFF`), `1px` light-slate dividers (`#E5E7EB`), and subtle glassmorphic floating map controls (`bg-white/85 backdrop-blur-md`).
* **Semantic Signal Colors (Strictly 4 Meanings):**
* **Signal Crimson (`#D92D20`):** Delays, Vande Bharat priority overtakes, and critical connection risk (`< 40%` survival).


* **Freight Amber (`#D97706`):** Pulsing Phantom Freight Shadow warnings and loop-line holds.


* **Rescue Emerald (`#059669`):** Safe connection status, on-time arrival, and the recommended OSRM NH-16 road-transfer polyline.


* **Deep Ink (`#111827`) & Muted Slate (`#6B7280`):** Primary typography and completed past stations.


* **Typography Rules:** Use `Inter` or `Plus Jakarta Sans` for crisp UI labels and **`JetBrains Mono`** (with CSS `font-variant-numeric: tabular-nums`) for all timestamps, delay minutes, and kilometer chainages so ticking numbers never jitter horizontally.
* **Human-First Microcopy:** Never force passengers to decode statistical jargon. Always pair technical labels with plain language:
* Show **`Likely 12:09 PM`** (`P50`) with subtle sub-labels `Best 12:02 · Worst 12:24`.


* Show plain-language causal cards: *"Held ~14 mins at Cuttack Loop Line for 20836 Vande Bharat overtake"*.





---

## 3. Screen-by-Screen Blueprint & Responsive Layout

Build **mobile-first** (390px viewport first, ready to wrap later in Capacitor) with a responsive **Desktop Split-Pane** (`lg:grid-cols-12`) for judge demos:

### Screen A: Zero-Friction Home / Corridor Selector

* **Search Bar:** Instant filter by train number or name (`12821 Dhauli Express`, `20836 Vande Bharat`).
* **Live Corridor Pulse Strip:** 3 clean status pills showing active trains on ECoR, current weather drag (Open-Meteo), and any active freight shadows.


* **1-Tap Train Cards:** Each card shows Train No, Name, current location (`Passing Nergundi`), current delay pill (`+28m`), and a mini risk indicator (`Overtake Ahead` / `Freight Drag`).



### Screen B: Main Tracking & Decision Workspace

On **Desktop (`>= 1024px`)**: Left `42%` = *Where is My Train* Smart Timeline + Rescue Panel; Right `58%` = Live MapLibre GL Corridor Radar.

On **Mobile (`< 1024px`)**: Sticky top segmented switch (`Timeline` / `Live Radar`) with a floating bottom Rescue Action Sheet.

1. **Sticky Train Header:**
* Train No & Name, current speed (`34 km/h`), delay badge (`+28m late`), and a subtle **Data Status Pill** (`Live Sync` · `Local Replay` · `Demo 10x`).


* **`Boarding Status` Segmented Pill:** `[ At Station ]` vs. `[ On Board ]` — directly drives the `passenger_status` field sent to `/api/v1/rescue/evaluate` to enforce the **Safe-Boarding Rule**.




2. **Connection Guard Card (Top of Timeline):**
* Lightweight inline selector: *"Need to reach **[Bhubaneswar ▾]** by **[12:15 PM ▾]** (+15m transfer buffer)"*.


* **Survival Meter + Range Bar:** Renders the `P10–P50–P90` arrival band visually against the vertical `12:15 PM` deadline line.


* **Safe-Boarding Banner (when `At Station`):** Crisp neutral info strip: *"Reach your boarding station by official schedule. Predictive rescue activates once you are on board."*


* **Early-Junction Rescue Card (when `On Board` & survival `< 40%`):** High-contrast emerald-bordered card:


* Headline: **`Save ~21 mins — Deboard early at Cuttack (10:58 AM)`**


* Breakdown: `Exit + Cab (10m) → NH-16 Drive (40m) → Reach BBS by 11:48 AM`


* Button: **`Show NH-16 Route on Map`** (smoothly zooms MapLibre to fit Cuttack $\rightarrow$ Bhubaneswar).


* Micro-footer: *"Advisory only—deboarding remains your choice following railway safety rules."*






3. **The Upgraded *Where is My Train* Vertical Timeline:**
* **Row Anatomy:** `[Scheduled / Expected Time]` — `[Vertical Track Rail & Node]` — `[Station Name, Platform/Loop Tag, Delay Chip]`.
* **Past Stops:** Muted opacity (`55%`), solid slate line, checkmark node.
* **Live Train Position:** Animated crimson train pill sliding smoothly along the vertical rail between stations, showing `"4.2 km from Cuttack"`.
* **Collapsed Non-Stop Stations:** Just like *Where is My Train*, group small intermediate pass-through stations under an expandable `"3 intermediate blocks ▾"` button—**unless** a Phantom Freight Shadow or Loop Hold is active on one of those blocks, in which case automatically surface that hazard pill inline!
* **Inline Causal Pills:** Tapping `"⚠ Ghost Freight Ahead (86%)"` or `"⇄ Overtake Hold (+14m)"` expands a 2-line plain-English explanation (e.g., *"Preceding express slowed 1.7× near Barang coal junction; estimated clearance at next 750m loop"*).




4. **MapLibre GL Corridor Digital Twin:**
* **Track Layer:** Clean dark-slate GeoJSON mainline (`BHC → PURI`) with crisp white station dots and highlighted `750m` loop markers.


* **Moving Trains Layer:** Smooth 60 FPS WebGL symbols with directional chevrons and train number badges (Vande Bharat highlighted in crimson, target train ringed in crisp white/red halo).
* **Phantom Freight Overlay:** Pulsing translucent amber corridor segment + warning marker on affected blocks.


* **OSRM Rescue Route Layer:** Animated dashed emerald road polyline along NH-16 from the rescue junction (`CTC`) to the destination (`BBS`) with a floating `"NH-16 Cab: ~40 min"` label.




5. **Hidden Presenter / Judge Control Drawer (`Shift + D` or triple-tap logo):**
* Keeps the passenger interface 100% uncluttered while letting you drive the live demo effortlessly:
* Speed selector: `1x` | `10x` | `30x`
* Action buttons: `Start 28m Delay Demo` · `Inject Phantom Freight (Barang)` · `Simulate ULIP FOIS Override` · `Test Offline Replay` · `Reset`.







---

## 4. Technical Stack & Zero-Lag 60 FPS Frontend Architecture

### Exact Library Choices

* **Framework & Build:** `Vite` + `React 19` + `TypeScript` + `Tailwind CSS v4`.
* **Map Engine:** `maplibre-gl` + `react-map-gl` (`v8.1+`, importing cleanly from `react-map-gl/maplibre`).
* **Basemap (100% Free, Zero API Keys):** **OpenFreeMap Positron** (`[https://tiles.openfreemap.org/styles/positron](https://tiles.openfreemap.org/styles/positron)`) — an ultra-clean light vector basemap that requires zero sign-up or billing tokens and makes crimson/amber/emerald railway overlays immediately readable.
* **State & Data:** `Zustand` (tiny, selector-based global store for UI state) + native `WebSocket` with exponential-backoff reconnect.
* **Icons:** `lucide-react` (`TrainFront`, `AlertTriangle`, `Navigation`, `Clock`, `ShieldCheck`, `WifiOff`, `ArrowRightLeft`).

### The Zero-Lag 60 FPS Interpolation Pattern (Do Not Skip This)

A common React + MapLibre mistake is dumping WebSocket coordinates straight into React `useState` and animating markers via DOM `<Marker>` components. That causes 60 full React re-renders per second and makes the timeline sluggish.

Instead, split state into **two lanes**:

1. **UI State Lane (Zustand — Updates every 1.5s):** Stores station timelines, `P10/P50/P90` ETAs, causal cards, survival probability, and rescue route payloads. React only re-renders lightweight text cards once per WebSocket tick.
2. **GPU Animation Lane (`useRef` + `requestAnimationFrame` — 60 FPS):**
* On every WebSocket message (`/ws/corridor`), update a mutable `trainTargetsRef.current` map storing `{ prevLat, prevLng, nextLat, nextLng, tickTime }` without triggering a React render.
* Inside `CorridorMap.tsx`, a `requestAnimationFrame` loop linearly interpolates (`lerp`) every train's coordinates between `prev` and `next` over the 1.5-second tick window and pushes one single GeoJSON `FeatureCollection` straight to the WebGL layer via `map.getSource('live-trains').setData(geojson)`.
* Result: silky 60 FPS train movement and zero dropped frames even on a mid-range phone or laptop.



### Clean Frontend Folder Structure

```text
rail-pulse-frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                       # Responsive layout shell (Home vs. Workspace)
│   ├── types/
│   │   └── corridor.ts               # Exact TypeScript mirrors of FastAPI Pydantic schemas
│   ├── stores/
│   │   └── useRailStore.ts           # Selected train, On-Board toggle, connection deadline, live snapshot
│   ├── services/
│   │   ├── api.ts                    # Typed fetch wrappers (/topology, /forecast, /rescue, /demo)
│   │   ├── wsClient.ts               # Auto-reconnecting /ws/corridor listener + offline detector
│   │   └── mockFallback.ts           # Built-in client demo data so UI can be built & tested standalone
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopHeader.tsx         # Train title, delay chip, Safe-Boarding toggle, Live/Replay pill
│   │   │   └── DemoDrawer.tsx        # Hidden Shift+D judge controls
│   │   ├── home/
│   │   │   └── TrainPicker.tsx       # WIMT-style fast search + active corridor train cards
│   │   ├── timeline/
│   │   │   ├── VerticalTimeline.tsx  # WIMT-style vertical rail, live train dot, collapsible stops
│   │   │   ├── StationRow.tsx        # Individual stop row + loop-hold badge
│   │   │   ├── HazardTrackPill.tsx   # Inline Phantom Freight / Overtake causal expander
│   │   │   └── EtaRangeBar.tsx       # Visual P10 / P50 / P90 bar with vertical deadline pin
│   │   ├── rescue/
│   │   │   ├── ConnectionGuard.tsx   # Destination + deadline picker + survival gauge
│   │   │   └── RescueBanner.tsx      # Actionable Cuttack NH-16 cab hop card + safety disclaimer
│   │   └── map/
│   │       ├── CorridorMap.tsx       # MapLibre GL canvas, OpenFreeMap Positron + offline blank fallback
│   │       ├── useTrainAnimator.ts   # 60 FPS requestAnimationFrame WebGL GeoJSON interpolator
│   │       └── MapLegend.tsx         # Compact floating glassmorphic legend

```

---

## 5. Frontend Pitfalls Audit & Concrete Fixes

| # | Frontend Pitfall | Why It Breaks During Demos | Concrete Prevention |
| --- | --- | --- | --- |
| **1** | **Blank Map When Venue Wi-Fi Drops** | OpenFreeMap vector tiles require internet; if Wi-Fi fails, MapLibre shows an error or blank white screen. | Catch `map.on('error')` on tile load and fall back to an inline minimalist local MapLibre style JSON (`{ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#F5F3EE' }}] }`)—your local GeoJSON tracks, stations, moving trains, and OSRM road route still render at 60 FPS.

 |
| **2** | **Jargon Overload (`STR`, `CQR`, `P90`)** | Normal users and non-ML judges glaze over if the main card screams *"STR=1.72, CQR=3.4, P90"*. | Keep passenger labels human (`Earliest`, `Likely`, `Worst Case`, `Hidden Goods Train Ahead`) and tuck exact math (`STR 1.7×`, `P90`) into crisp secondary pill badges or expandable detail drawers.

 |
| **3** | **Mobile Viewport & Notch Bugs** | Using `h-screen` (`100vh`) cuts off the Rescue Banner behind mobile browser address bars and breaks Capacitor wrapping later. | Use `h-[100dvh]` and Tailwind safe-area padding (`pb-[env(safe-area-inset-bottom)]`), keeping all tap targets `>= 44px`. |
| **4** | **WebSocket Flood on Reconnect** | Switching tabs or brief Wi-Fi blips can leave zombie WebSockets firing duplicate updates. | Keep a single `wsClient` singleton with clean `close()` on unmount, exponential backoff (`1s → 2s → 5s`), and a visible amber `"Reconnecting · Showing Cached Snapshot"` pill.

 |
| **5** | **Waiting on Backend to Start Coding** | Frontend sits idle for 8 hours waiting for FastAPI endpoints. | Build against `mockFallback.ts` matching the exact JSON contracts from Hour 1; flip one `VITE_USE_MOCK=false` env flag the moment FastAPI comes online. |

---

## 6. Phased 14-Hour Execution Plan (For the Frontend Teammate)

| Hours | Milestone | Deliverable & Verification |
| --- | --- | --- |
| **Hours 0–2** | **Scaffold, Tokens & Mock Contracts** | Init Vite + React + TS + Tailwind + Zustand + `maplibre-gl` + `react-map-gl`. Lock `types/corridor.ts` with Backend/ML teammates and seed `mockFallback.ts` with the Bhadrak $\rightarrow$ Cuttack $\rightarrow$ Barang $\rightarrow$ Bhubaneswar demo trip.

 |
| **Hours 2–6** | **WIMT Vertical Timeline + Connection Guard** | Build `TrainPicker`, `TopHeader` (with `At Station / On Board` toggle), `EtaRangeBar`, `VerticalTimeline`, `HazardTrackPill`, and `RescueBanner`. Verify the `At Station` lock hides road rescue and `On Board` reveals the Cuttack NH-16 21-min savings card.

 |
| **Hours 6–10** | **MapLibre GL Digital Twin + 60 FPS Animator** | Wire OpenFreeMap Positron basemap + offline style fallback, render ECoR corridor GeoJSON + stations + pulsing amber Phantom Freight zone + dashed emerald NH-16 OSRM route. Add `useTrainAnimator.ts` (`requestAnimationFrame`) and verify smooth 60 FPS motion.

 |
| **Hours 10–12** | **Live FastAPI + WebSocket Integration** | Point `api.ts` and `wsClient.ts` to FastAPI (`/api/v1/...` and `/ws/corridor`), wire `DemoDrawer` (`Shift+D`), and test mobile + desktop split-pane responsiveness. |
| **Hours 12–14** | **Resilience & Judge Polish** | Kill Wi-Fi and test offline map + local replay pill; run a full 2-minute dry run of the `28-min late → Ghost Freight at Barang → Vande Bharat Overtake → Cuttack NH-16 Rescue` click flow.

 |

Want me to generate the **starter `types/corridor.ts` + `useRailStore.ts` + `VerticalTimeline` / `EtaRangeBar` React components** so your frontend teammate can drop them straight into Vite and start seeing the UI in 10 minutes?