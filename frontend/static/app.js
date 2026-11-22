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
const btnJudgeDrawer = document.getElementById("btn-judge-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const sliderDelay = document.getElementById("slider-delay");
const sliderValDisp = document.getElementById("slider-val-disp");
const btnApplyDelay = document.getElementById("btn-apply-delay");
const btnResetDemo = document.getElementById("btn-reset-demo");
const btnInjectFreight = document.getElementById("btn-inject-freight");
const btnScenarioStandard = document.getElementById("btn-scenario-standard");

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  initMap();
  initDrawer();
  initTabsAndToggles();
  await loadTopology();
  connectWebSocket();
  await fetchForecast(selectedTrain);
  drawMareyDiagram();
  window.addEventListener("resize", () => drawMareyDiagram());
});

// 1. Initialize Map with Clean CartoDB Positron Light Tiles
function initMap() {
  map = L.map("corridor-map", {
    zoomControl: true,
    attributionControl: false,
  }).setView([20.40, 85.90], 9);

  // CartoDB Positron Light Basemap
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 18,
    subdomains: "abcd",
  }).addTo(map);
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
          className: isFreightBlock ? "pulsing-freight-track" : "",
        }).addTo(map);

        line.bindPopup(`
          <div class="font-mono text-xs text-slate-800 p-1">
            <strong>${props.block_id}</strong> (${props.direction})<br/>
            Length: ${props.length_km} km | MPS: ${props.mps_kmph} km/h<br/>
            ${isFreightBlock ? '<span class="text-amber-700 font-bold">⚠ ACTIVE FREIGHT SHADOW (COAL RAKE)</span>' : ''}
          </div>
        `);
      } else if (props.feature_type === "STATION") {
        const coord = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
        const isJunction = props.is_major_junction;

        const circle = L.circleMarker(coord, {
          radius: isJunction ? 6.5 : 4,
          fillColor: "#ffffff",
          color: isJunction ? "#1e3a8a" : "#64748b",
          weight: isJunction ? 2.5 : 1.5,
          fillOpacity: 1.0,
        }).addTo(map);

        circle.bindTooltip(`<strong>${props.station_code}</strong> - ${props.station_name}`, {
          permanent: isJunction,
          direction: "right",
          className: "leaflet-tooltip",
        });
      }
    });

    // Draw Cuttack -> Bhubaneswar NH-16 Rescue Highway
    const nh16Coords = [
      [20.463, 85.882], // Cuttack
      [20.410, 85.850],
      [20.350, 85.830],
      [20.296, 85.824], // Bhubaneswar
    ];
    L.polyline(nh16Coords, {
      color: "#2563eb",
      weight: 3,
      dashArray: "5, 5",
      opacity: 0.8,
    }).addTo(map).bindTooltip("NH-16 Expressway Rescue Route (38 mins)", { direction: "top" });

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
        className: "custom-div-icon",
        html: `
          <div style="background-color: ${bgColor}; color: ${textColor}; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.2)">
            ${t.direction === "DN" ? "▼" : "▲"}
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      trainMarkers[t.train_no] = L.marker(latlng, { icon }).addTo(map);
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
        <div class="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200/80 p-2.5 rounded-lg font-medium">
          ${plan.human_guidance}
        </div>
      `;
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

  // Trajectory 1: 12821 Dhauli Express (Delayed + Loop Line Hold at Cuttack)
  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(padLeft + xSpan * 0.3, padTop); // Dep BHC 10:10
  ctx.lineTo(padLeft + xSpan * 1.8, stations[1].y); // Arr CTC 10:55
  ctx.lineTo(padLeft + xSpan * 2.4, stations[1].y); // Loop Hold at CTC until 11:12 (Plateau!)
  ctx.lineTo(padLeft + xSpan * 4.2, stations[2].y); // Arr BBS 12:09
  ctx.lineTo(padLeft + xSpan * 5.2, stations[3].y); // Arr PURI 12:35
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

// 9. Drawer & Slider Interactions
function initDrawer() {
  btnJudgeDrawer.addEventListener("click", () => judgeDrawer.classList.remove("translate-x-full"));
  btnCloseDrawer.addEventListener("click", () => judgeDrawer.classList.add("translate-x-full"));

  sliderDelay.addEventListener("input", (e) => {
    sliderValDisp.textContent = `+${e.target.value} mins`;
  });

  btnApplyDelay.addEventListener("click", async () => {
    const addedMins = parseFloat(sliderDelay.value);
    await fetch("/api/v1/demo/inject-delay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ train_no: "12821", added_delay_mins: addedMins }),
    });
    await fetchForecast(selectedTrain);
    judgeDrawer.classList.add("translate-x-full");
  });

  btnResetDemo.addEventListener("click", async () => {
    await fetch("/api/v1/demo/scenario/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_name: "DHAULI_CASCADE", speed_multiplier: 1 }),
    });
    await fetchForecast(selectedTrain);
    judgeDrawer.classList.add("translate-x-full");
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
    judgeDrawer.classList.add("translate-x-full");
  });

  btnScenarioStandard.addEventListener("click", async () => {
    await fetch("/api/v1/demo/scenario/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_name: "DHAULI_CASCADE", speed_multiplier: 1 }),
    });
    await fetchForecast("12821");
    judgeDrawer.classList.add("translate-x-full");
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
      });
    }
  });
}

// 10. Tabs & Asymmetric Safety Toggles
function initTabsAndToggles() {
  // Train Tabs
  ["12821", "22895", "18410"].forEach((tNo) => {
    const tab = document.getElementById(`tab-${tNo}`);
    if (tab) {
      tab.addEventListener("click", async () => {
        selectedTrain = tNo;
        ["12821", "22895", "18410"].forEach((n) => {
          const b = document.getElementById(`tab-${n}`);
          if (n === tNo) {
            b.className = "flex-1 py-1.5 px-3 rounded-lg font-semibold bg-white text-slate-900 shadow-sm border border-slate-200/60 transition";
          } else {
            b.className = "flex-1 py-1.5 px-3 rounded-lg font-medium text-slate-600 hover:text-slate-900 transition";
          }
        });
        await fetchForecast(selectedTrain);
      });
    }
  });

  // Asymmetric Safety Toggle (At Home vs On Board)
  const toggleUnboarded = document.getElementById("toggle-unboarded");
  const toggleOnboard = document.getElementById("toggle-onboard");

  toggleUnboarded.addEventListener("click", async () => {
    passengerStatus = "PRE_BOARDING";
    toggleUnboarded.className = "px-2.5 py-0.5 rounded bg-white text-amber-800 font-bold shadow-sm border border-slate-200/60 transition";
    toggleOnboard.className = "px-2.5 py-0.5 rounded text-slate-500 hover:text-slate-900 transition";
    await evaluateBailout(selectedTrain);
  });

  toggleOnboard.addEventListener("click", async () => {
    passengerStatus = "ON_BOARD";
    toggleOnboard.className = "px-2.5 py-0.5 rounded bg-white text-emerald-800 font-bold shadow-sm border border-slate-200/60 transition";
    toggleUnboarded.className = "px-2.5 py-0.5 rounded text-slate-500 hover:text-slate-900 transition";
    await evaluateBailout(selectedTrain);
  });
}
