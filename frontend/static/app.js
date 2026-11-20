/**
 * RAIL-PULSE Interactive Control Room Dashboard
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
});

// 1. Initialize Map
function initMap() {
  map = L.map("corridor-map", {
    zoomControl: true,
    attributionControl: false,
  }).setView([20.40, 85.90], 9);

  // Dark basemap with offline fallback
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
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
          color: isFreightBlock ? "#f59e0b" : "#10b981",
          weight: isFreightBlock ? 5 : 3,
          opacity: 0.8,
          className: isFreightBlock ? "pulsing-freight-track" : "",
        }).addTo(map);

        line.bindPopup(`
          <div class="font-mono text-xs text-slate-900">
            <strong>${props.block_id}</strong> (${props.direction})<br/>
            Length: ${props.length_km} km | MPS: ${props.mps_kmph} km/h<br/>
            ${isFreightBlock ? '<span class="text-amber-600 font-bold">⚠ ACTIVE FREIGHT SHADOW</span>' : ''}
          </div>
        `);
      } else if (props.feature_type === "STATION") {
        const coord = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
        const isJunction = props.is_major_junction;

        const circle = L.circleMarker(coord, {
          radius: isJunction ? 7 : 4,
          fillColor: isJunction ? "#00f0ff" : "#94a3b8",
          color: "#060913",
          weight: 2,
          fillOpacity: 0.9,
        }).addTo(map);

        circle.bindTooltip(`<strong>${props.station_code}</strong> - ${props.station_name}`, {
          permanent: isJunction,
          direction: "right",
          className: "bg-slate-900 border border-slate-700 text-slate-100 text-[10px] px-1 py-0.5 rounded",
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
      color: "#38bdf8",
      weight: 3,
      dashArray: "6, 6",
      opacity: 0.85,
    }).addTo(map).bindTooltip("NH-16 Expressway Bailout Route (38 mins)", { direction: "top" });

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
    wsStatusBadge.className = "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-300";
    wsDot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-ping";
    wsText.textContent = "LIVE SYNC (1.5s)";
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
    wsStatusBadge.className = "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-slate-800 border border-slate-700 text-slate-400";
    wsDot.className = "w-2 h-2 rounded-full bg-amber-400";
    wsText.textContent = "RECONNECTING...";
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

    let color = "#10b981";
    if (isDhauli) color = "#f59e0b";
    if (isVandeBharat) color = "#00f0ff";

    if (!trainMarkers[t.train_no]) {
      const icon = L.divIcon({
        className: "custom-div-icon",
        html: `
          <div style="background-color: ${color}; color: #000; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; border: 2px solid white; box-shadow: 0 0 10px ${color}">
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
      <div class="font-mono text-xs text-slate-900">
        <strong>${t.train_no} ${t.train_name}</strong><br/>
        Speed: ${t.speed_kmph.toFixed(0)} km/h | Delay: +${t.current_delay_mins.toFixed(0)}m<br/>
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
    container.innerHTML = `<div class="text-xs text-slate-500 font-mono text-center py-4">No delay disruptions detected on track.</div>`;
    return;
  }

  cards.forEach((card) => {
    let badgeColor = "bg-amber-500/20 text-amber-300 border-amber-500/30";
    let icon = "⚠";

    if (card.event === "PRIORITY_OVERTAKE_HOLD" || card.event === "CASCADE_DOUBLE_OVERTAKE") {
      badgeColor = "bg-rose-500/20 text-rose-300 border-rose-500/30";
      icon = "⚡";
    } else if (card.event === "FREIGHT_SHADOW_DRAG") {
      badgeColor = "bg-amber-500/20 text-amber-300 border-amber-500/30";
      icon = "🚂";
    }

    const div = document.createElement("div");
    div.className = "bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-start gap-3";
    div.innerHTML = `
      <div class="px-2 py-0.5 rounded text-xs font-mono font-bold border ${badgeColor} flex items-center gap-1 mt-0.5">
        <span>${icon}</span> +${card.added_delay_mins.toFixed(0)}m
      </div>
      <div class="flex-1">
        <div class="text-xs font-bold text-slate-200">${card.station_name}</div>
        <p class="text-[11px] text-slate-400 mt-0.5">${card.human_message}</p>
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
        <div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs">
          <div class="flex items-center gap-2 text-amber-400 font-bold mb-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            Asymmetric Liability Guardrail Active
          </div>
          <p class="text-slate-300">Passenger is unboarded. To prevent liability from slack recovery, road bailout is suppressed.</p>
          <div class="mt-2 text-slate-400 font-mono">
            Mandatory Station Reporting: <strong class="text-emerald-400">11:44 AM (P10)</strong>
          </div>
        </div>
      `;
    } else if (data.bailout_recommended && data.bailout_plan) {
      const plan = data.bailout_plan;
      content.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <span class="text-xs text-rose-400 font-bold flex items-center gap-1 font-mono">
            <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            Connection Survival: ${data.survival_probability_pct}% (HIGH RISK MISS)
          </span>
          <span class="text-xs text-emerald-400 font-bold font-mono">Save ~${plan.minutes_saved.toFixed(0)} mins</span>
        </div>
        <div class="text-xs text-slate-300">
          <strong>Recommended Action:</strong> Deboard at <span class="text-rail-cyan font-bold">${plan.deboard_station_name}</span>.
        </div>
        <div class="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/90 p-2.5 rounded border border-slate-800">
          <div>
            <span class="text-slate-500">ROAD TRANSIT:</span>
            <div class="text-slate-200">${plan.road_mode}</div>
          </div>
          <div>
            <span class="text-slate-500">ROAD DURATION:</span>
            <div class="text-slate-200 font-bold">${plan.road_drive_mins} mins</div>
          </div>
        </div>
        <div class="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-2 rounded">
          ${plan.human_guidance}
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="text-xs text-emerald-400 font-mono flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          Train Projected on Track | Connection Survival: ${data.survival_probability_pct || 91}% (SAFE)
        </div>
        <p class="text-[11px] text-slate-400">Current train progression is sufficient to meet downstream connection deadline.</p>
      `;
    }
  } catch (err) {
    console.error("Failed to evaluate bailout:", err);
  }
}

// 8. Draw Marey Space-Time Diagram (Canvas)
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
  const padLeft = 60, padRight = 20, padTop = 15, padBottom = 25;

  ctx.clearRect(0, 0, w, h);

  // Background Grid
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;

  // Stations on Y-Axis
  const stations = [
    { code: "BHC", km: 0.0, y: padTop },
    { code: "CTC", km: 115.0, y: padTop + (h - padTop - padBottom) * 0.55 },
    { code: "BBS", km: 143.0, y: padTop + (h - padTop - padBottom) * 0.70 },
    { code: "PURI", km: 206.0, y: h - padBottom },
  ];

  ctx.fillStyle = "#64748b";
  ctx.font = "10px ui-monospace, monospace";
  stations.forEach((s) => {
    ctx.fillText(`${s.code}`, 10, s.y + 4);
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
    ctx.fillText(t, x - 12, h - 8);
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, h - padBottom);
    ctx.stroke();
  });

  // Trajectory 1: 12821 Dhauli Express (Delayed + Loop Line Hold at Cuttack)
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(padLeft + xSpan * 0.3, padTop); // Dep BHC 10:10
  ctx.lineTo(padLeft + xSpan * 1.8, stations[1].y); // Arr CTC 10:55
  ctx.lineTo(padLeft + xSpan * 2.4, stations[1].y); // Loop Hold at CTC until 11:12 (Plateau!)
  ctx.lineTo(padLeft + xSpan * 4.2, stations[2].y); // Arr BBS 12:09
  ctx.lineTo(padLeft + xSpan * 5.2, stations[3].y); // Arr PURI 12:35
  ctx.stroke();

  // Trajectory 2: 22895 Vande Bharat Express (Fast Mainline Overtake at 130 km/h)
  ctx.strokeStyle = "#00f0ff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(padLeft + xSpan * 1.4, padTop); // Dep BHC 10:42
  ctx.lineTo(padLeft + xSpan * 2.1, stations[1].y); // Pass CTC at full speed 11:03 (Overtakes Dhauli!)
  ctx.lineTo(padLeft + xSpan * 2.8, stations[2].y); // Arr BBS 11:24
  ctx.lineTo(padLeft + xSpan * 3.8, stations[3].y); // Arr PURI 11:55
  ctx.stroke();

  // Annotate Overtake Point
  ctx.fillStyle = "#f43f5e";
  ctx.beginPath();
  ctx.arc(padLeft + xSpan * 2.1, stations[1].y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#38bdf8";
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
            b.className = "py-2 rounded-lg bg-rail-cyan/20 text-rail-cyan text-xs font-mono font-bold border border-rail-cyan/40";
          } else {
            b.className = "py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-mono font-bold border border-slate-700 hover:border-rail-cyan transition";
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
            b.className = "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-rail-cyan/20 border border-rail-cyan/40 text-rail-cyan transition";
          } else {
            b.className = "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-800/60 border border-slate-700 text-slate-300 hover:bg-slate-800 transition";
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
    toggleUnboarded.className = "px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 transition";
    toggleOnboard.className = "px-2 py-0.5 rounded text-slate-400 hover:text-slate-200 transition";
    await evaluateBailout(selectedTrain);
  });

  toggleOnboard.addEventListener("click", async () => {
    passengerStatus = "ON_BOARD";
    toggleOnboard.className = "px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 transition";
    toggleUnboarded.className = "px-2 py-0.5 rounded text-slate-400 hover:text-slate-200 transition";
    await evaluateBailout(selectedTrain);
  });
}
