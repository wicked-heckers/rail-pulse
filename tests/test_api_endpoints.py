import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def test_client():
    return TestClient(app)


@pytest.mark.asyncio
async def test_root_and_health():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Root endpoint
        root_resp = await client.get("/")
        assert root_resp.status_code == 200
        root_data = root_resp.json()
        assert root_data["project"] == "RAIL-PULSE"
        assert "Bhadrak" in root_data["corridor"]

        # Health endpoint
        health_resp = await client.get("/api/v1/health")
        assert health_resp.status_code == 200
        health_data = health_resp.json()
        assert health_data["status"] == "HEALTHY"
        assert health_data["ml_models_loaded"] is True
        assert health_data["active_trains_count"] >= 0


@pytest.mark.asyncio
async def test_corridor_topology_geojson():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/corridor/topology")
        assert resp.status_code == 200
        geo = resp.json()
        assert geo["type"] == "FeatureCollection"
        features = geo["features"]
        assert len(features) > 10

        station_features = [f for f in features if f["properties"].get("feature_type") == "STATION"]
        assert len(station_features) == 9

        chord_features = [f for f in features if f["properties"].get("feature_type") == "FREIGHT_MERGE_CHORD"]
        assert len(chord_features) == 1
        assert chord_features[0]["properties"]["merge_station"] == "BRAG"


@pytest.mark.asyncio
async def test_demo_scenario_controls_and_state():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Reset and start demo scenario
        start_resp = await client.post(
            "/api/v1/demo/scenario/start",
            json={"scenario_name": "DHAULI_CASCADE", "speed_multiplier": 1},
        )
        assert start_resp.status_code == 200
        start_data = start_resp.json()
        assert start_data["status"] == "STARTED"
        assert start_data["active_trains"] >= 3

        # 2. Verify state mirror populated
        state_resp = await client.get("/api/v1/corridor/state")
        assert state_resp.status_code == 200
        state_data = state_resp.json()
        assert len(state_data["trains"]) >= 3

        # 3. Inject delay onto Dhauli Express (12821)
        inject_resp = await client.post(
            "/api/v1/demo/inject-delay",
            json={"train_no": "12821", "added_delay_mins": 15.0},
        )
        assert inject_resp.status_code == 200
        inject_data = inject_resp.json()
        assert inject_data["status"] == "DELAY_INJECTED"
        assert inject_data["added_delay_mins"] == 15.0

        # 4. Update simulation speed
        speed_resp = await client.post(
            "/api/v1/demo/speed",
            json={"speed_multiplier": 10},
        )
        assert speed_resp.status_code == 200
        assert speed_resp.json()["speed_multiplier"] == 10


@pytest.mark.asyncio
async def test_train_forecast_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Start fresh scenario first
        await client.post(
            "/api/v1/demo/scenario/start",
            json={"scenario_name": "DHAULI_CASCADE", "speed_multiplier": 1},
        )

        # Query forecast for Dhauli Express
        resp = await client.get("/api/v1/trains/12821/forecast")
        assert resp.status_code == 200
        data = resp.json()

        assert data["train_no"] == "12821"
        assert data["train_name"] == "Dhauli Express"
        assert data["p10_eta_epoch"] <= data["p50_eta_epoch"] <= data["p90_eta_epoch"]
        assert data["p10_delay_mins"] <= data["p50_delay_mins"] <= data["p90_delay_mins"]
        assert len(data["station_timeline"]) > 0
        assert isinstance(data["causal_cards"], list)

        # Non-existent train returns 404
        not_found_resp = await client.get("/api/v1/trains/99999/forecast")
        assert not_found_resp.status_code == 404


@pytest.mark.asyncio
async def test_rescue_evaluation_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/api/v1/demo/scenario/start",
            json={"scenario_name": "DHAULI_CASCADE", "speed_multiplier": 1},
        )

        # 1. Safe-Boarding Pre-Boarding Guardrail
        pre_board_resp = await client.post(
            "/api/v1/rescue/evaluate",
            json={
                "train_no": "12821",
                "destination_code": "BBS",
                "connection_deadline_utc": 1795076100,  # 12:15 PM
                "transfer_buffer_mins": 15,
                "passenger_status": "PRE_BOARDING",
            },
        )
        assert pre_board_resp.status_code == 200
        pb_data = pre_board_resp.json()
        assert pb_data["safe_boarding_lock"] is True
        assert pb_data["bailout_recommended"] is False

        # 2. On-board passenger evaluation (delayed Dhauli)
        onboard_resp = await client.post(
            "/api/v1/rescue/evaluate",
            json={
                "train_no": "12821",
                "destination_code": "BBS",
                "connection_deadline_utc": 1795076100,  # 12:15 PM
                "transfer_buffer_mins": 15,
                "passenger_status": "ON_BOARD",
            },
        )
        assert onboard_resp.status_code == 200
        ob_data = onboard_resp.json()
        assert "survival_probability_pct" in ob_data
        assert "risk_level" in ob_data
        assert "train_p50_eta_epoch" in ob_data
        assert "safe_boarding_lock" in ob_data



@pytest.mark.asyncio
async def test_ulip_fois_webhook():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Invalid key returns 401
        unauth_resp = await client.post(
            "/api/v1/webhooks/ulip-fois",
            headers={"X-ULIP-API-Key": "wrong-key"},
            json={
                "rake_id": "BOXN_9921_COAL",
                "block_id": "DN_CTC_BRAG",
                "direction": "DN",
                "speed_kmph": 28.0,
                "cargo_type": "COAL",
            },
        )
        assert unauth_resp.status_code == 401

        # 2. Valid key returns 200 ACCEPTED
        resp = await client.post(
            "/api/v1/webhooks/ulip-fois",
            headers={"X-ULIP-API-Key": "railpulse-enterprise-ulip-key"},
            json={
                "rake_id": "BOXN_9921_COAL",
                "block_id": "DN_CTC_BRAG",
                "direction": "DN",
                "speed_kmph": 28.0,
                "cargo_type": "COAL",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ACCEPTED"
        assert data["rake_id"] == "BOXN_9921_COAL"
        assert data["override_applied"] is True


@pytest.mark.asyncio
async def test_demo_freight_inject_and_reset():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Inject freight on block
        resp = await client.post(
            "/api/v1/demo/inject-freight",
            json={
                "block_id": "DN_CTC_BRAG",
                "penalty_mins": 25.0,
                "confidence": 0.92,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "FREIGHT_INJECTED"
        assert data["block_id"] == "DN_CTC_BRAG"
        assert data["penalty_mins"] == 25.0

        # Verify state includes the phantom freight
        state_resp = await client.get("/api/v1/corridor/state")
        assert state_resp.status_code == 200
        st = state_resp.json()
        matching_shadows = [f for f in st["phantom_freights"] if f["block_id"] == "DN_CTC_BRAG"]
        assert len(matching_shadows) == 1
        assert matching_shadows[0]["clearance_eta_mins"] == 25.0

        # 2. Reset corridor
        reset_resp = await client.post("/api/v1/demo/reset")
        assert reset_resp.status_code == 200
        r_data = reset_resp.json()
        assert r_data["status"] == "RESET"


@pytest.mark.asyncio
async def test_trigger_live_overtake_does_not_teleport_trains():
    """Verify trigger-overtake preserves live coordinates while scheduling loop hold and Vande speed boost."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/v1/demo/reset")
        before = (await client.get("/api/v1/corridor/state")).json()["trains"]
        d_before = next(t["chainage_km"] for t in before if t["train_no"] == "12821")
        v_before = next(t["chainage_km"] for t in before if t["train_no"] == "22895")

        resp = await client.post("/api/v1/demo/trigger-overtake")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "OVERTAKE_TRIGGERED"
        assert data["dhauli_km"] == d_before
        assert data["vande_km"] == v_before
        assert data["hold_km"] >= d_before

        await client.post("/api/v1/demo/reset")

        # Apply Monsoon Rain (+8m + 28mm/hr) + TSR (+14m) on 22895 Vande Bharat
        apply_resp = await client.post(
            "/api/v1/demo/apply-causes",
            json={"train_no": "22895", "causes": ["MONSOON_RAIN", "TSR_MAINTENANCE"]},
        )
        assert apply_resp.status_code == 200
        data = apply_resp.json()
        assert data["status"] == "CAUSES_APPLIED"
        assert data["direct_delay_mins"] == 22.0
        assert data["rain_mm_hr"] == 28.0
        assert set(data["active_causes"]) == {"MONSOON_RAIN", "TSR_MAINTENANCE"}

        fc = (await client.get("/api/v1/trains/22895/forecast")).json()
        events = {c["event"] for c in fc["causal_cards"]}
        assert "MONSOON_WEATHER_DRAG" in events
        assert "STATIC_TSR_CAUTION" in events

        # Apply Freight Blockade on UP train 18410
        up_resp = await client.post(
            "/api/v1/demo/apply-causes",
            json={"train_no": "18410", "causes": ["FREIGHT_BLOCKADE", "OHE_BRAKE_FAULT"]},
        )
        assert up_resp.status_code == 200
        assert up_resp.json()["freight_penalty_mins"] == 20.0
        assert up_resp.json()["direct_delay_mins"] == 25.0

        await client.post("/api/v1/demo/reset")


@pytest.mark.asyncio
async def test_predict_cascade_unified_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Start demo scenario first
        await client.post(
            "/api/v1/demo/scenario/start",
            json={"scenario_name": "DHAULI_CASCADE", "speed_multiplier": 1},
        )

        resp = await client.post(
            "/api/v1/predict-cascade",
            json={
                "train_number": "12821",
                "current_station": "BHC",
                "injected_delay_mins": 28.0,
                "connection_target": {
                    "station_code": "BBS",
                    "deadline_time": "12:15",
                    "transfer_buffer_mins": 15,
                },
                "passenger_status": "ON_BOARD",
            },
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["train_number"] == "12821"
        assert data["train_name"] == "Dhauli Express"
        assert "naive_ntes_eta" in data
        assert "p10_safe_report" in data["quantiles_target"]
        assert "p50_expected" in data["quantiles_target"]
        assert "p90_worst_case" in data["quantiles_target"]
        assert isinstance(data["overtake_alerts"], list)
        assert "fsi_score" in data["freight_shadow"]
        assert "survival_probability_pct" in data["connection_audit"]



def test_websocket_corridor_stream(test_client):
    with test_client.websocket_connect("/ws/corridor") as websocket:
        # Handshake snapshot is delivered immediately
        data = websocket.receive_json()
        assert "trains" in data
        assert "weather" in data

        # Test heartbeat ping/pong
        websocket.send_text("ping")
        reply = websocket.receive_text()
        assert reply == "pong"


@pytest.mark.asyncio
async def test_delay_injection_no_double_counting():
    """Verify that injecting delay does not compound on subsequent snapshot ticks."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Reset to base scenario
        await client.post("/api/v1/demo/scenario/start", json={"scenario_name": "DHAULI_CASCADE", "speed_multiplier": 1})
        f_before = (await client.get("/api/v1/trains/12821/forecast")).json()
        base_delay = f_before["current_delay_mins"]

        # Inject +15 min delay
        inj_resp = await client.post("/api/v1/demo/inject-delay", json={"train_no": "12821", "added_delay_mins": 15.0})
        assert inj_resp.status_code == 200

        # Verify new delay is exactly base_delay + 15
        f_after = (await client.get("/api/v1/trains/12821/forecast")).json()
        assert f_after["current_delay_mins"] == pytest.approx(base_delay + 15.0, abs=1.0)


@pytest.mark.asyncio
async def test_random_goods_train_endpoint():
    """Verify /demo/random-freight places an undetected goods rake on track with zero immediate delay."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/v1/demo/reset")
        resp = await client.post(
            "/api/v1/demo/random-freight",
            json={"target_train_no": "12821", "seed": 7},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "RANDOM_GOODS_TRAIN_PLACED"
        assert data["block_id"].startswith("DN_")

        st = (await client.get("/api/v1/corridor/state")).json()
        assert len(st.get("goods_rakes", [])) == 1
        assert st["goods_rakes"][0]["detected"] is False
        assert st["goods_rakes"][0]["status_phase"] == "HIDDEN_ON_TRACK"
        # No phantom freight or delay added yet before train reaches it and AI predicts
        assert st["phantom_freights"] == []


@pytest.mark.asyncio
async def test_corridor_list_and_switch():
    """Verify listing corridors and switching between ECoR and SER corridors."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. List corridors
        list_resp = await client.get("/api/v1/corridor/list")
        assert list_resp.status_code == 200
        corridors = list_resp.json()
        assert len(corridors) >= 2
        ids = [c["id"] for c in corridors]
        assert "ECoR_BHC_PURI" in ids
        assert "SER_HWH_KGP" in ids

        try:
            # 2. Switch to Kolkata Trunk Corridor (SER_HWH_KGP)
            switch_resp = await client.post(
                "/api/v1/corridor/switch",
                json={"corridor_id": "SER_HWH_KGP", "speed_multiplier": 1},
            )
            assert switch_resp.status_code == 200
            snap = switch_resp.json()
            assert snap["corridor_id"] == "SER_HWH_KGP"
            assert len(snap["trains"]) >= 3
            t_nos = [t["train_no"] for t in snap["trains"]]
            assert "12821" in t_nos
            assert "22895" in t_nos
            assert "12822" in t_nos

            # 3. Verify Kolkata topology endpoint
            topo_resp = await client.get("/api/v1/corridor/topology?corridor_id=SER_HWH_KGP")
            assert topo_resp.status_code == 200
            topo = topo_resp.json()
            stn_features = [f for f in topo["features"] if f["properties"].get("feature_type") == "STATION"]
            assert len(stn_features) == 8
            stn_codes = [f["properties"]["station_code"] for f in stn_features]
            assert "HWH" in stn_codes
            assert "KGP" in stn_codes
            assert "MCA" in stn_codes
        finally:
            # 4. Switch back to East Coast Trunk Corridor (ECoR_BHC_PURI)
            back_resp = await client.post(
                "/api/v1/corridor/switch",
                json={"corridor_id": "ECoR_BHC_PURI", "speed_multiplier": 1},
            )
            assert back_resp.status_code == 200
            back_snap = back_resp.json()
            assert back_snap["corridor_id"] == "ECoR_BHC_PURI"


@pytest.mark.asyncio
async def test_kolkata_demo_scenario_and_freight_injection():
    """Verify that starting a demo scenario on Kolkata trunk corridor preserves corridor_id and injects SER freight."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        try:
            # Switch to SER corridor
            await client.post(
                "/api/v1/corridor/switch",
                json={"corridor_id": "SER_HWH_KGP", "speed_multiplier": 1},
            )

            # Start Santragachi cascade scenario
            scen_resp = await client.post(
                "/api/v1/demo/scenario/start",
                json={"scenario_id": "SANTRAGACHI_CASCADE", "speed_multiplier": 1},
            )
            assert scen_resp.status_code == 200
            scen_data = scen_resp.json()
            assert scen_data["corridor_id"] == "SER_HWH_KGP"
            assert scen_data["scenario_id"] == "SANTRAGACHI_CASCADE"

            # Verify state snapshot reflects SER corridor and Santragachi freight blockade
            snap_resp = await client.get("/api/v1/corridor/state")
            assert snap_resp.status_code == 200
            snap = snap_resp.json()
            assert snap["corridor_id"] == "SER_HWH_KGP"
            freights = snap.get("phantom_freights", [])
            assert len(freights) >= 1
            assert any(f.get("block_id") == "DN_SRC_ULB" for f in freights)
        finally:
            # Clean reset back to ECoR
            await client.post(
                "/api/v1/corridor/switch",
                json={"corridor_id": "ECoR_BHC_PURI", "speed_multiplier": 1},
            )
            await client.post("/api/v1/demo/reset")




