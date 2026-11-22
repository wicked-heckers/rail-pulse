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
        resp = await client.post(
            "/api/v1/webhooks/ulip-fois",
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

