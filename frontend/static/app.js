/**
 * RAIL-PULSE Interactive Control Room Dashboard
 * Clean, Pale-White & Professional Frontend
 * ECoR Cascade Overtake Predictor & Multimodal Bailout Engine
 */

// Global State
let map, trainMarkers = {}, topologyData = null;
let selectedTrain = "12821";
let passengerStatus = "ON_BOARD"; // 'ON_BOARD' or 'PRE_BOARDING'
let currentForecast = null;
let ws = null;

// DOM Elements
const wsStatusBadge = document.getElementById("ws-status-badge");
const wsDot = document.getElementById("ws-dot");
const wsText = document.getElementById("ws-text");
const judgeDrawer = document.getElementById("judge-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");
const btnJudgeDrawer = document.getElementById("btn-judge-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const sliderDelay = document.getElementById("slider-delay");
const sliderValDisp = document.getElementById("slider-val-disp");
const sliderPreviewText = document.getElementById("slider-preview-text");
const btnApplyDelay = document.getElementById("btn-apply-delay");
const btnResetDemo = document.getElementById("btn-reset-demo");
const btnInjectFreight = document.getElementById("btn-inject-freight");
const btnScenarioStandard = document.getElementById("btn-scenario-standard");

// Bailout Modal DOM Elements
const bailoutModal = document.getElementById("bailout-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnCancelModal = document.getElementById("btn-cancel-modal");
const btnConfirmBooking = document.getElementById("btn-confirm-booking");

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  await initMap();
  initDrawer();
  initBailoutModal();
  initTabsAndToggles();
  await loadTopology();
  connectWebSocket();
  await fetchForecast(selectedTrain);
  drawMareyDiagram();
  window.addEventListener("resize", () => drawMareyDiagram());
});

// Toast Notification Manager (Sonner-inspired)
function showToast(title, message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  let borderClass = "border-slate-200";
  let icon = "ℹ️";

  if (type === "success") {
    borderClass = "border-emerald-200 bg-emerald-50/90 text-emerald-900";
    icon = "✓";
  } else if (type === "warn") {
    borderClass = "border-amber-200 bg-amber-50/90 text-amber-900";
    icon = "⚠️";
  } else if (type === "error") {
    borderClass = "border-rose-200 bg-rose-50/90 text-rose-900";
    icon = "⚡";
  } else {
    borderClass = "border-slate-200 bg-white/95 text-slate-800";
  }

  toast.className = `toast-item flex items-start gap-3 p-3.5 rounded-xl border ${borderClass} shadow-lg backdrop-blur-md text-xs`;
  toast.innerHTML = `
    <span class="font-bold text-sm leading-none mt-0.5">${icon}</span>
    <div class="flex-1">
      <div class="font-bold">${title}</div>
      <div class="text-slate-600 mt-0.5">${message}</div>
    </div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// 1. Initialize Map with Mapbox Light-v11 & OpenStreetMap Fallback
async function initMap() {
  map = L.map("corridor-map", {
    zoomControl: true,
    attributionControl: false,
  }).setView([20.40, 85.90], 9);

  let mapboxToken = null;
  try {
    const cfgRes = await fetch("/api/v1/corridor/config");
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      mapboxToken = cfg.mapbox_access_token;
    }
  } catch (e) {
    console.warn("Could not fetch corridor config:", e);
  }

  const osmUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  if (mapboxToken) {
    const mapboxUrl = `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`;
    const mapboxLayer = L.tileLayer(mapboxUrl, {
      maxZoom: 18,
      tileSize: 512,
      zoomOffset: -1,
      attribution: "© Mapbox © OpenStreetMap",
    });

    mapboxLayer.on("tileerror", function () {
      console.warn("Mapbox tile loading failed, switching to OpenStreetMap fallback...");
      map.removeLayer(mapboxLayer);
      L.tileLayer(osmUrl, { maxZoom: 18 }).addTo(map);
    });

    mapboxLayer.addTo(map);
  } else {
    // Zero-token fallback: public clean OpenStreetMap tiles
    L.tileLayer(osmUrl, {
      maxZoom: 18,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
  }
}

// 2. Load Topology & Draw Infrastructure
async function loadTopology() {
  try {
    const res = await fetch("/api/v1/corridor/topology");
    topologyData = await res.json();

    // Render Track Blocks
    topologyData.features.forEach((feature) => {
      const props = feature.properties;

      if (props.feature_type === "TRACK_BLOCK") {
        const coords = feature.geometry.coordinates.map((c) => [c[1], c[0]]);
        const isFreightBlock = props.block_id === "DN_CTC_BRAG";

        const line = L.polyline(coords, {
          color: isFreightBlock ? "#d97706" : "#059669",
          weight: isFreightBlock ? 5 : 3.5,
          opacity: isFreightBlock ? 0.9 : 0.75,
          className: isFreightBlock ? "pulsing-freight-track cursor-pointer" : "cursor-pointer",
        }).addTo(map);

        line.bindPopup(`
          <div class="font-mono text-xs text-slate-800 p-1">
            <strong>${props.block_id}</strong> (${props.direction})<br/>
            Length: ${props.length_km} km | MPS: ${props.mps_kmph} km/h<br/>
            ${isFreightBlock ? '<span class="text-amber-700 font-bold">⚠ ACTIVE FREIGHT SHADOW (COAL RAKE)</span>' : '<span class="text-emerald-700 font-semibold">Track Block Clear</span>'}
          </div>
        `);
      } else if (props.feature_type === "STATION") {
        const coord = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
        const isJunction = props.is_major_junction;

        const circle = L.circleMarker(coord, {
          radius: isJunction ? 7 : 4.5,
          fillColor: "#ffffff",
          color: isJunction ? "#1e3a8a" : "#64748b",
          weight: isJunction ? 3 : 2,
          fillOpacity: 1.0,
          className: "cursor-pointer",
        }).addTo(map);

        // Click on station to zoom & show rich details
        circle.on("click", () => {
          map.flyTo(coord, 11, { duration: 0.8 });
          showToast(`Station Selected: ${props.station_name} (${props.station_code})`, `Chainage: ${props.chainage_km.toFixed(1)} km | Platforms: 4 | Loop Capacity: 750m`);
        });

        circle.bindTooltip(`<strong>${props.station_code}</strong> - ${props.station_name}`, {
          permanent: isJunction,
          direction: "right",
          className: "leaflet-tooltip",
        });

        circle.bindPopup(`
          <div class="font-sans text-xs text-slate-800 p-1">
            <h4 class="font-bold text-slate-900">${props.station_name} (${props.station_code})</h4>
            <div class="text-[11px] text-slate-600 mt-1 font-mono">
              Chainage: ${props.chainage_km.toFixed(1)} km from BHC<br/>
              Type: ${isJunction ? 'Major Junction / Overtake Node' : 'Intermediate Crossing Station'}<br/>
              ${props.station_code === 'CTC' ? '<span class="text-blue-700 font-bold">★ Active Priority Overtake Loop Active</span>' : ''}
              ${props.station_code === 'BRAG' ? '<span class="text-amber-700 font-bold">★ Coal Freight Goods Loop Exit</span>' : ''}
            </div>
          </div>
        `);
      }
    });

    // Draw Cuttack -> Bhubaneswar NH-16 Rescue Highway
    const nh16Coords = [
      [20.463, 85.882], // Cuttack
      [20.410, 85.850],
      [20.350, 85.830],
      [20.296, 85.824], // Bhubaneswar
    ];
    const roadLine = L.polyline(nh16Coords, {
      color: "#2563eb",
      weight: 3.5,
      dashArray: "5, 5",
      opacity: 0.85,
    }).addTo(map);
    
    roadLine.bindTooltip("NH-16 Expressway Rescue Route (38 mins drive)", { direction: "top" });
    roadLine.on("click", () => {
      openBailoutModal();
    });

  } catch (err) {
    console.error("Failed to load corridor topology:", err);
  }
}

// 3. Connect Live WebSocket
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/corridor`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    wsStatusBadge.className = "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono bg-emerald-50 border border-emerald-200 text-emerald-800 transition-colors";
    wsDot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
    wsText.textContent = "Live Sync (1.5s)";
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.trains) {
        updateTrainPositions(data.trains);
      }
    } catch (e) {
      console.warn("WS parse error:", e);
    }
  };

  ws.onclose = () => {
    wsStatusBadge.className = "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono bg-amber-50 border border-amber-200 text-amber-800 transition-colors";
    wsDot.className = "w-2 h-2 rounded-full bg-amber-500";
    wsText.textContent = "Reconnecting...";
    setTimeout(connectWebSocket, 2000);
  };
}

// 4. Update Train Positions on Map
function updateTrainPositions(trains) {
  trains.forEach((t) => {
    if (!t.lat || !t.lon) return;

    const latlng = [t.lat, t.lon];
    const isDhauli = t.train_no === "12821";
    const isVandeBharat = t.train_no === "22895";

    let bgColor = "#059669";
    let textColor = "#ffffff";
    if (isDhauli) bgColor = "#d97706";
    if (isVandeBharat) bgColor = "#2563eb";

    if (!trainMarkers[t.train_no]) {
      const icon = L.divIcon({
        className: "custom-div-icon cursor-pointer",
        html: `
          <div style="background-color: ${bgColor}; color: ${textColor}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; border: 2.5px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.25)">
            ${t.direction === "DN" ? "▼" : "▲"}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker(latlng, { icon }).addTo(map);
      marker.on("click", () => {
        selectTrain(t.train_no);
        map.flyTo(latlng, 11, { duration: 0.8 });
        showToast(`Tracking ${t.train_no} ${t.train_name}`, `Speed: ${t.speed_kmph.toFixed(0)} km/h • Current Delay: +${t.current_delay_mins.toFixed(0)}m`);
      });
      trainMarkers[t.train_no] = marker;
    } else {
      trainMarkers[t.train_no].setLatLng(latlng);
    }

    trainMarkers[t.train_no].bindTooltip(`
      <div class="font-mono text-xs text-slate-900 p-1">
        <strong>${t.train_no} ${t.train_name}</strong><br/>
        Speed: ${t.speed_kmph.toFixed(0)} km/h • Delay: +${t.current_delay_mins.toFixed(0)}m<br/>
        Chainage: ${t.chainage_km.toFixed(1)} km (${t.status})
      </div>
    `);
  });
}

// 5. Fetch Predictive Forecast for Selected Train
async function fetchForecast(trainNo) {
  try {
    const res = await fetch(`/api/v1/trains/${trainNo}/forecast`);
    if (!res.ok) return;
    currentForecast = await res.json();

    // Update Comparison Card
    document.getElementById("disp-current-delay").textContent = `+${currentForecast.current_delay_mins.toFixed(0)} mins`;

    const naiveDate = new Date(currentForecast.naive_ntes_eta_epoch * 1000);
    const p10Date = new Date(currentForecast.p10_eta_epoch * 1000);
    const p50Date = new Date(currentForecast.p50_eta_epoch * 1000);
    const p90Date = new Date(currentForecast.p90_eta_epoch * 1000);

    const fmt = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    document.getElementById("disp-naive-eta").textContent = fmt(naiveDate);
    document.getElementById("disp-p10-eta").textContent = fmt(p10Date);
    document.getElementById("disp-p50-eta").textContent = fmt(p50Date);
    document.getElementById("disp-p50-eta-sub").textContent = fmt(p50Date);
    document.getElementById("disp-p90-eta").textContent = fmt(p90Date);

    // Update Causal Cards
    renderCausalCards(currentForecast.causal_cards);

    // Update Bailout
    await evaluateBailout(trainNo);
    drawMareyDiagram();

  } catch (err) {
    console.error("Failed to fetch forecast:", err);
  }
}

// 6. Render Causal Cards
function renderCausalCards(cards) {
  const container = document.getElementById("causal-cards-container");
  container.innerHTML = "";
  document.getElementById("cards-count").textContent = `${cards.length} Events`;

  if (cards.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 font-mono text-center py-4">No delay disruptions detected on track.</div>`;
    return;
  }

  cards.forEach((card) => {
    let badgeColor = "bg-amber-50 text-amber-800 border-amber-200";
    let icon = "⚠";

    if (card.event === "PRIORITY_OVERTAKE_HOLD" || card.event === "CASCADE_DOUBLE_OVERTAKE") {
      badgeColor = "bg-rose-50 text-rose-700 border-rose-200";
      icon = "⚡";
    } else if (card.event === "FREIGHT_SHADOW_DRAG") {
      badgeColor = "bg-amber-50 text-amber-800 border-amber-200";
      icon = "🚂";
    }

    const div = document.createElement("div");
    div.className = "bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3 transition-colors hover:border-slate-300";
    div.innerHTML = `
      <div class="px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${badgeColor} flex items-center gap-1 mt-0.5">
        <span>${icon}</span> +${card.added_delay_mins.toFixed(0)}m
      </div>
      <div class="flex-1">
        <div class="text-xs font-bold text-slate-900">${card.station_name}</div>
        <p class="text-[11px] text-slate-600 mt-0.5 leading-relaxed">${card.human_message}</p>
      </div>
    `;
    container.appendChild(div);
  });
}

// 7. Evaluate Early-Junction Bailout
async function evaluateBailout(trainNo) {
  const content = document.getElementById("bailout-content");

  try {
    const res = await fetch("/api/v1/rescue/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        train_no: trainNo,
        destination_code: "BBS",
        connection_deadline_utc: 1795075800, // 12:10 PM
        transfer_buffer_mins: 15,
        passenger_status: passengerStatus,
      }),
    });

    const data = await res.json();

    if (data.safe_boarding_lock) {
      content.innerHTML = `
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
          <div class="flex items-center gap-2 text-amber-900 font-bold mb-1">
            <svg class="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            Asymmetric Liability Guardrail Active
          </div>
          <p class="text-slate-700">Passenger is unboarded. To prevent liability from slack recovery, road bailout is suppressed.</p>
          <div class="mt-2 text-slate-600 font-mono text-[11px]">
            Mandatory Station Reporting: <strong class="text-emerald-700">11:44 AM (P10)</strong>
          </div>
        </div>
      `;
    } else if (data.bailout_recommended && data.bailout_plan) {
      const plan = data.bailout_plan;
      content.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-200 pb-2">
          <span class="text-xs text-rose-700 font-bold flex items-center gap-1.5 font-mono">
            <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            Connection Survival: ${data.survival_probability_pct}% (HIGH RISK MISS)
          </span>
          <span class="text-xs text-emerald-700 font-bold font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Save ~${plan.minutes_saved.toFixed(0)} mins</span>
        </div>
        <div class="text-xs text-slate-800">
          <strong>Recommended Action:</strong> Deboard at <span class="text-blue-700 font-bold">${plan.deboard_station_name}</span>.
        </div>
        <div class="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
          <div>
            <span class="text-slate-400">ROAD TRANSIT:</span>
            <div class="text-slate-800 font-semibold">${plan.road_mode}</div>
          </div>
          <div>
            <span class="text-slate-400">ROAD DURATION:</span>
            <div class="text-slate-800 font-bold">${plan.road_drive_mins} mins</div>
          </div>
        </div>
        <div class="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200/80 p-2.5 rounded-lg font-medium flex items-center justify-between">
          <span>${plan.human_guidance}</span>
          <button id="btn-open-bailout-modal" class="btn-press ml-2 px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold text-[10px] shrink-0">
            Book Cab
          </button>
        </div>
      `;

      // Attach listener to Book Cab button
      const btnBook = document.getElementById("btn-open-bailout-modal");
      if (btnBook) {
        btnBook.addEventListener("click", () => openBailoutModal());
      }
    } else {
      content.innerHTML = `
        <div class="text-xs text-emerald-700 font-mono font-medium flex items-center gap-2">
          <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          Train Projected on Track • Survival: ${data.survival_probability_pct || 91}% (SAFE)
        </div>
        <p class="text-[11px] text-slate-500">Current train progression is sufficient to meet downstream connection deadline.</p>
      `;
    }
  } catch (err) {
    console.error("Failed to evaluate bailout:", err);
  }
}

// 8. Draw Marey Space-Time Diagram on Light Canvas
function drawMareyDiagram() {
  const canvas = document.getElementById("marey-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Handle high-DPI displays
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padLeft = 60, padRight = 25, padTop = 18, padBottom = 28;

  ctx.clearRect(0, 0, w, h);

  // Background Grid
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;

  // Stations on Y-Axis
  const stations = [
    { code: "BHC", km: 0.0, y: padTop },
    { code: "CTC", km: 115.0, y: padTop + (h - padTop - padBottom) * 0.55 },
    { code: "BBS", km: 143.0, y: padTop + (h - padTop - padBottom) * 0.70 },
    { code: "PURI", km: 206.0, y: h - padBottom },
  ];

  ctx.fillStyle = "#64748b";
  ctx.font = "10px 'JetBrains Mono', ui-monospace, monospace";
  stations.forEach((s) => {
    ctx.fillText(`${s.code}`, 12, s.y + 4);
    ctx.beginPath();
    ctx.moveTo(padLeft, s.y);
    ctx.lineTo(w - padRight, s.y);
    ctx.stroke();
  });

  // Time on X-Axis (10:00 to 12:30)
  const times = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];
  const xSpan = (w - padLeft - padRight) / (times.length - 1);

  times.forEach((t, i) => {
    const x = padLeft + i * xSpan;
    ctx.fillText(t, x - 14, h - 8);
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, h - padBottom);
    ctx.stroke();
  });

  // Trajectory 1: 12821 Dhauli Express (Dynamic Delay + Loop Line Hold at Cuttack)
  const currentDelay = (currentForecast && currentForecast.current_delay_mins != null) ? currentForecast.current_delay_mins : 28.0;
  const delayDelta = (currentDelay - 28.0) / 30.0; // Normalized in 30-min block spans
  const dynamicShift = Math.max(-0.4, Math.min(2.0, delayDelta * 0.45));

  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(padLeft + xSpan * (0.3 + dynamicShift * 0.3), padTop); // Dep BHC
  ctx.lineTo(padLeft + xSpan * (1.8 + dynamicShift * 0.7), stations[1].y); // Arr CTC
  ctx.lineTo(padLeft + xSpan * (2.4 + dynamicShift * 0.8), stations[1].y); // Loop Hold at CTC (Plateau!)
  ctx.lineTo(padLeft + xSpan * (4.2 + dynamicShift), stations[2].y); // Arr BBS
  ctx.lineTo(padLeft + xSpan * (5.2 + dynamicShift), stations[3].y); // Arr PURI
  ctx.stroke();

  // Trajectory 2: 22895 Vande Bharat Express (Fast Mainline Overtake at 130 km/h)
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(padLeft + xSpan * 1.4, padTop); // Dep BHC 10:42
  ctx.lineTo(padLeft + xSpan * 2.1, stations[1].y); // Pass CTC at full speed 11:03 (Overtakes Dhauli!)
  ctx.lineTo(padLeft + xSpan * 2.8, stations[2].y); // Arr BBS 11:24
  ctx.lineTo(padLeft + xSpan * 3.8, stations[3].y); // Arr PURI 11:55
  ctx.stroke();

  // Annotate Overtake Point
  ctx.fillStyle = "#dc2626";
  ctx.beginPath();
  ctx.arc(padLeft + xSpan * 2.1, stations[1].y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "bold 10px 'Inter', sans-serif";
  ctx.fillText("⚡ Overtake at CTC Loop", padLeft + xSpan * 2.1 + 8, stations[1].y - 8);
}

// 9. Drawer & Slider Interactions with Live Preview & Backdrop Dismiss
function openDrawer() {
  judgeDrawer.classList.add("open");
  drawerBackdrop.classList.remove("hidden");
  requestAnimationFrame(() => drawerBackdrop.classList.remove("opacity-0"));
}

function closeDrawer() {
  judgeDrawer.classList.remove("open");
  drawerBackdrop.classList.add("opacity-0");
  setTimeout(() => drawerBackdrop.classList.add("hidden"), 300);
}

function initDrawer() {
  btnJudgeDrawer.addEventListener("click", openDrawer);
  btnCloseDrawer.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);

  // Keyboard navigation: Escape closes drawer and modals
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDrawer();
      closeBailoutModal();
    }
  });

  sliderDelay.addEventListener("input", (e) => {
    const val = parseInt(e.target.value);
    sliderValDisp.textContent = `+${val} mins`;

    // Dynamic Live Preview Calculation
    const baseHour = 11;
    const baseMin = 48 + val;
    const calcMin = baseMin % 60;
    const calcHour = baseHour + Math.floor(baseMin / 60);
    const ampm = calcHour >= 12 ? "PM" : "AM";
    const hourDisp = calcHour > 12 ? calcHour - 12 : calcHour;
    const padMin = calcMin < 10 ? `0${calcMin}` : calcMin;

    sliderPreviewText.textContent = `BBS ETA ~${hourDisp}:${padMin} ${ampm} (+${(val + 24)}m cascade)`;
  });

  btnApplyDelay.addEventListener("click", async () => {
    const selectDelayTrain = document.getElementById("select-delay-train");
    const targetTrainNo = selectDelayTrain ? selectDelayTrain.value : selectedTrain;
    const addedMins = parseFloat(sliderDelay.value);
    await fetch("/api/v1/demo/inject-delay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ train_no: targetTrainNo, added_delay_mins: addedMins }),
    });
    if (targetTrainNo !== selectedTrain) {
      selectTrain(targetTrainNo);
    } else {
      await fetchForecast(selectedTrain);
    }
    closeDrawer();
    showToast("Delay Injected", `+${addedMins} mins applied to Train ${targetTrainNo}`, "warn");
  });

  btnResetDemo.addEventListener("click", async () => {
    await fetch("/api/v1/demo/scenario/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_name: "DHAULI_CASCADE", speed_multiplier: 1 }),
    });
    await fetchForecast(selectedTrain);
    closeDrawer();
    showToast("Corridor Reset", "All blocks and trains restored to baseline schedule", "success");
  });

  btnInjectFreight.addEventListener("click", async () => {
    await fetch("/api/v1/webhooks/ulip-fois", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rake_id: "BOXN_COAL_CONFIRMED",
        block_id: "DN_CTC_BRAG",
        direction: "DN",
        speed_kmph: 28.0,
      }),
    });
    await fetchForecast(selectedTrain);
    closeDrawer();
    showToast("Freight Confirmed", "ULIP FOIS Coal Rake confirmed at Barang Junction loop", "warn");
  });

  btnScenarioStandard.addEventListener("click", async () => {
    await fetch("/api/v1/demo/scenario/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_name: "DHAULI_CASCADE", speed_multiplier: 1 }),
    });
    await fetchForecast("12821");
    closeDrawer();
    showToast("Scenario 1 Loaded", "Standard SIH26028 Demo: Dhauli hold + Vande Bharat pass", "info");
  });

  // Speed Multipliers
  [1, 10, 30].forEach((spd) => {
    const btn = document.getElementById(`btn-speed-${spd}`);
    if (btn) {
      btn.addEventListener("click", async () => {
        await fetch("/api/v1/demo/speed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speed_multiplier: spd }),
        });
        [1, 10, 30].forEach((s) => {
          const b = document.getElementById(`btn-speed-${s}`);
          if (s === spd) {
            b.className = "btn-press py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-mono font-bold border border-blue-200 transition";
          } else {
            b.className = "btn-press py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-mono font-semibold border border-slate-200 hover:bg-slate-200 transition";
          }
        });
        showToast("Simulation Speed", `Time-warp multiplier set to ${spd}x`, "info");
      });
    }
  });
}

// 10. Bailout Modal Controls
function openBailoutModal() {
  bailoutModal.classList.remove("hidden");
  requestAnimationFrame(() => {
    bailoutModal.classList.remove("opacity-0");
    bailoutModal.querySelector(".modal-card").classList.remove("scale-95");
    bailoutModal.querySelector(".modal-card").classList.add("scale-100");
  });
}

function closeBailoutModal() {
  bailoutModal.classList.add("opacity-0");
  bailoutModal.querySelector(".modal-card").classList.remove("scale-100");
  bailoutModal.querySelector(".modal-card").classList.add("scale-95");
  setTimeout(() => bailoutModal.classList.add("hidden"), 200);
}

function initBailoutModal() {
  btnCloseModal.addEventListener("click", closeBailoutModal);
  btnCancelModal.addEventListener("click", closeBailoutModal);
  btnConfirmBooking.addEventListener("click", () => {
    closeBailoutModal();
    showToast("Cab Confirmed & Locked", "Driver OD-02-AK-4491 is arriving at Cuttack Junction Exit. Safe travels!", "success");
  });
}

// 11. Train Switcher Helper
function selectTrain(trainNo) {
  selectedTrain = trainNo;
  const selectDelayTrain = document.getElementById("select-delay-train");
  if (selectDelayTrain) {
    selectDelayTrain.value = trainNo;
  }
  ["12821", "22895", "18410"].forEach((n) => {
    const b = document.getElementById(`tab-${n}`);
    if (b) {
      if (n === trainNo) {
        b.className = "btn-press flex-1 py-1.5 px-3 rounded-lg font-semibold bg-white text-slate-900 shadow-sm border border-slate-200/60 transition";
      } else {
        b.className = "btn-press flex-1 py-1.5 px-3 rounded-lg font-medium text-slate-600 hover:text-slate-900 transition";
      }
    }
  });
  fetchForecast(selectedTrain);
}

// 12. Tabs & Asymmetric Safety Toggles
function initTabsAndToggles() {
  ["12821", "22895", "18410"].forEach((tNo) => {
    const tab = document.getElementById(`tab-${tNo}`);
    if (tab) {
      tab.addEventListener("click", () => selectTrain(tNo));
    }
  });

  // Asymmetric Safety Toggle (At Home vs On Board)
  const toggleUnboarded = document.getElementById("toggle-unboarded");
  const toggleOnboard = document.getElementById("toggle-onboard");

  toggleUnboarded.addEventListener("click", async () => {
    passengerStatus = "PRE_BOARDING";
    toggleUnboarded.className = "btn-press px-2.5 py-0.5 rounded bg-white text-amber-800 font-bold shadow-sm border border-slate-200/60 transition";
    toggleOnboard.className = "btn-press px-2.5 py-0.5 rounded text-slate-500 hover:text-slate-900 transition";
    await evaluateBailout(selectedTrain);
    showToast("Passenger Mode: At Home", "Safe-Boarding Lock active: road bailout suppressed to prevent missed train", "info");
  });

  toggleOnboard.addEventListener("click", async () => {
    passengerStatus = "ON_BOARD";
    toggleOnboard.className = "btn-press px-2.5 py-0.5 rounded bg-white text-emerald-800 font-bold shadow-sm border border-slate-200/60 transition";
    toggleUnboarded.className = "btn-press px-2.5 py-0.5 rounded text-slate-500 hover:text-slate-900 transition";
    await evaluateBailout(selectedTrain);
    showToast("Passenger Mode: On Board", "Dynamic In-Journey Bailout active: evaluating Cuttack NH-16 highway options", "info");
  });
}
