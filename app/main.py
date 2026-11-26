import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.deps import demo_provider, live_provider, replay_provider
from app.api.v1 import corridor, demo, forecast, health, rescue, webhooks
from app.api.ws import router as ws_router
from app.api.ws import ws_manager
from app.config import settings
from app.core.redis_client import redis_client
from app.core.state_store import state_store
from app.engine.quantile_ml import QuantileMLEngine

BASE_DIR = Path(__file__).resolve().parent.parent
logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger("railpulse.main")


async def _apply_snapshot_to_store(snap: dict[str, Any], mode: str) -> None:
    """Applies a normalized provider snapshot to the in-memory state store."""
    await state_store.set_provider_mode(mode)
    await state_store.update_trains(snap["trains"])
    await state_store.update_freight_shadows(snap["phantom_freights"])
    await state_store.update_weather(snap["weather"])


async def _poll_initial_state() -> str:
    """
    Seeds initial corridor state according to DEFAULT_PROVIDER_MODE,
    with automatic failover to REPLAY if LIVE_POLLER is unreachable.
    Returns the active provider mode string.
    """
    configured_mode = settings.DEFAULT_PROVIDER_MODE

    if configured_mode == "LIVE_POLLER":
        try:
            snap = await live_provider.get_corridor_snapshot(force_refresh=True)
            await _apply_snapshot_to_store(snap, "LIVE_POLLER")
            return "LIVE_POLLER"
        except (httpx.HTTPError, TimeoutError, RuntimeError, ValueError, OSError) as exc:
            logger.warning("Live poller unavailable at startup (%s). Engaging automatic REPLAY mode.", exc)
            snap = await replay_provider.get_corridor_snapshot()
            await _apply_snapshot_to_store(snap, "REPLAY")
            return "REPLAY"

    if configured_mode == "REPLAY":
        snap = await replay_provider.get_corridor_snapshot()
        await _apply_snapshot_to_store(snap, "REPLAY")
        return "REPLAY"

    snap = await demo_provider.tick()
    await _apply_snapshot_to_store(snap, "DEMO_SIMULATION")
    return "DEMO_SIMULATION"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Initializes ML models, seeds initial corridor state, and launches background
    simulation/replay tick, 120s Redis poller, and WebSocket fan-out broadcaster.
    """
    logger.info("Initializing RAIL-PULSE ECoR Corridor Intelligence Engine...")

    # 1. Warm ML Quantile Engine
    QuantileMLEngine.load_models()

    # 2. Seed initial state & sync to Redis
    active_mode = await _poll_initial_state()
    if active_mode == "DEMO_SIMULATION":
        await state_store.set_remaining_cause_delays(
            demo_provider.get_all_remaining_cause_delays(),
            demo_provider.get_all_remaining_loop_holds(),
        )
    init_snap = await state_store.get_snapshot()
    await redis_client.set_snapshot(init_snap, ttl=settings.REDIS_SNAPSHOT_TTL_SECONDS)
    logger.info(
        "Seeded corridor state (%s) with %d active trains.",
        active_mode,
        len(init_snap["trains"]),
    )

    # 3. Launch background workers
    async def _provider_worker():
        last_redis_sync = time.monotonic()
        last_live_poll = time.monotonic()
        in_replay_failover = active_mode == "REPLAY" and settings.DEFAULT_PROVIDER_MODE == "LIVE_POLLER"

        while True:
            try:
                await asyncio.sleep(1.5)
                now = time.monotonic()

                if settings.DEFAULT_PROVIDER_MODE == "LIVE_POLLER":
                    if (now - last_live_poll) >= settings.LIVE_POLL_INTERVAL_SECONDS:
                        last_live_poll = now
                        try:
                            snap = await live_provider.get_corridor_snapshot(force_refresh=True)
                            await _apply_snapshot_to_store(snap, "LIVE_POLLER")
                            in_replay_failover = False
                        except (httpx.HTTPError, TimeoutError, RuntimeError, ValueError, OSError) as exc:
                            if not in_replay_failover:
                                logger.warning("Upstream live feed dropped (%s). Switching to REPLAY mode.", exc)
                            in_replay_failover = True

                    if in_replay_failover:
                        await replay_provider.advance_simulation(1.5)
                        snap = await replay_provider.get_corridor_snapshot()
                        await _apply_snapshot_to_store(snap, "REPLAY")
                elif settings.DEFAULT_PROVIDER_MODE == "REPLAY":
                    await replay_provider.advance_simulation(1.5)
                    snap = await replay_provider.get_corridor_snapshot()
                    await _apply_snapshot_to_store(snap, "REPLAY")
                else:
                    await demo_provider.advance_simulation(1.5)
                    snap = await demo_provider.tick()
                    await state_store.set_remaining_cause_delays(
                        demo_provider.get_all_remaining_cause_delays(),
                        demo_provider.get_all_remaining_loop_holds(),
                    )
                    await _apply_snapshot_to_store(snap, "DEMO_SIMULATION")

                if (now - last_redis_sync) >= settings.LIVE_POLL_INTERVAL_SECONDS:
                    last_redis_sync = now
                    redis_snap = await state_store.get_snapshot()
                    await redis_client.set_snapshot(redis_snap, ttl=settings.REDIS_SNAPSHOT_TTL_SECONDS)
            except asyncio.CancelledError:
                break
            except Exception as e:  # noqa: BLE001
                logger.error(f"Provider worker error: {e}")

    async def _ws_broadcaster():
        while True:
            try:
                await asyncio.sleep(1.5)
                snap = await state_store.get_snapshot()
                await ws_manager.broadcast(snap)
            except asyncio.CancelledError:
                break
            except Exception as e:  # noqa: BLE001
                logger.error(f"WS broadcaster error: {e}")

    provider_task = asyncio.create_task(_provider_worker())
    ws_task = asyncio.create_task(_ws_broadcaster())

    yield

    # Graceful Shutdown
    logger.info("Stopping RAIL-PULSE background workers...")
    provider_task.cancel()
    ws_task.cancel()
    await asyncio.gather(provider_task, ws_task, return_exceptions=True)
    await redis_client.close()
    logger.info("RAIL-PULSE background workers stopped.")


app = FastAPI(
    title="RAIL-PULSE ECoR Intelligence Engine",
    version=settings.VERSION,
    description="Real-Time Predictive Train Cascade Engine & Multimodal Rescue System (ECoR Corridor SIH26028)",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing (CORS) for judge dashboards
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Static Files (Frontend UI Assets)
dist_dir = BASE_DIR / "frontend" / "dist"
assets_dir = dist_dir / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

fonts_dir = dist_dir / "fonts"
if fonts_dir.exists():
    app.mount("/fonts", StaticFiles(directory=str(fonts_dir)), name="fonts")

static_dir = BASE_DIR / "frontend" / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Mount API Routers
app.include_router(health.router, prefix="/api/v1")
app.include_router(corridor.router, prefix="/api/v1/corridor")
app.include_router(forecast.router, prefix="/api/v1")
app.include_router(rescue.router, prefix="/api/v1/rescue")
app.include_router(webhooks.router, prefix="/api/v1/webhooks")
app.include_router(demo.router, prefix="/api/v1/demo")
app.include_router(ws_router, prefix="/ws")


@app.get("/", tags=["Root"])
async def root(request: Request) -> Any:
    """
    Root endpoint: serves interactive control-room dashboard when visited from browsers,
    or JSON metadata dictionary for automated API clients.
    """
    accept = request.headers.get("accept", "")
    dist_index = BASE_DIR / "frontend" / "dist" / "index.html"
    index_file = dist_index if dist_index.exists() else (BASE_DIR / "frontend" / "index.html")
    if "text/html" in accept and index_file.exists():
        return FileResponse(index_file)

    return {
        "project": "RAIL-PULSE",
        "description": "ECoR Predictive Delay Cascade & Multimodal Rescue Engine",
        "corridor": "Bhadrak (BHC, 0.0km) -> Puri (PURI, 206.0km)",
        "version": settings.VERSION,
        "dashboard_url": "/dashboard",
        "docs_url": "/docs",
        "openapi_url": "/openapi.json",
        "health_check": "/api/v1/health",
        "topology": "/api/v1/corridor/topology",
        "state": "/api/v1/corridor/state",
        "predict_cascade": "/api/v1/predict-cascade",
        "websocket": "/ws/corridor",
    }


@app.get("/dashboard", response_class=FileResponse, tags=["Dashboard"])
async def dashboard():
    """Serves the interactive RAIL-PULSE control-room dashboard."""
    dist_index = BASE_DIR / "frontend" / "dist" / "index.html"
    index_file = dist_index if dist_index.exists() else (BASE_DIR / "frontend" / "index.html")
    if index_file.exists():
        return FileResponse(index_file)
    return {"error": "Dashboard template not found"}


@app.get("/{filename}.{ext}", include_in_schema=False)
async def serve_static_root_file(filename: str, ext: str):
    """
    Serves root-level static assets (e.g. logo.png, favicon.png, SVGs)
    from the production built frontend directory.
    """
    candidate = dist_dir / f"{filename}.{ext}"
    if candidate.is_file():
        return FileResponse(candidate)
    raise HTTPException(status_code=404, detail="File not found")


