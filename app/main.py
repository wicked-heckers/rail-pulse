import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import demo_provider
from app.api.v1 import corridor, demo, forecast, health, rescue, webhooks
from app.api.ws import router as ws_router, ws_manager
from app.config import settings
from app.core.state_store import state_store
from app.engine.quantile_ml import QuantileMLEngine

logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger("railpulse.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Initializes ML models, seeds initial corridor state, and launches background
    simulation tick and WebSocket fan-out broadcaster.
    """
    logger.info("Initializing RAIL-PULSE ECoR Corridor Intelligence Engine...")

    # 1. Warm ML Quantile Engine
    QuantileMLEngine.load_models()

    # 2. Seed initial deterministic state from demo provider
    init_snap = await demo_provider.tick()
    await state_store.update_trains(init_snap["trains"])
    await state_store.update_freight_shadows(init_snap["phantom_freights"])
    await state_store.update_weather(init_snap["weather"])
    logger.info(f"Seeded corridor state with {len(init_snap['trains'])} active trains.")

    # 3. Launch background workers
    async def _provider_worker():
        while True:
            try:
                await asyncio.sleep(1.5)
                await demo_provider.advance_simulation(1.5)
                snap = await demo_provider.tick()
                await state_store.update_trains(snap["trains"])
                await state_store.update_freight_shadows(snap["phantom_freights"])
                await state_store.update_weather(snap["weather"])
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Provider worker error: {e}")

    async def _ws_broadcaster():
        while True:
            try:
                await asyncio.sleep(1.5)
                snap = await state_store.get_snapshot()
                await ws_manager.broadcast(snap)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"WS broadcaster error: {e}")

    provider_task = asyncio.create_task(_provider_worker())
    ws_task = asyncio.create_task(_ws_broadcaster())

    yield

    # Graceful Shutdown
    logger.info("Stopping RAIL-PULSE background workers...")
    provider_task.cancel()
    ws_task.cancel()
    await asyncio.gather(provider_task, ws_task, return_exceptions=True)
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

# Mount API Routers
app.include_router(health.router, prefix="/api/v1")
app.include_router(corridor.router, prefix="/api/v1/corridor")
app.include_router(forecast.router, prefix="/api/v1")
app.include_router(rescue.router, prefix="/api/v1/rescue")
app.include_router(webhooks.router, prefix="/api/v1/webhooks")
app.include_router(demo.router, prefix="/api/v1/demo")
app.include_router(ws_router, prefix="/ws")


@app.get("/", tags=["Root"])
async def root() -> dict[str, Any]:
    """Root metadata endpoint with corridor overview and API sitemap."""
    return {
        "project": "RAIL-PULSE",
        "description": "ECoR Predictive Delay Cascade & Multimodal Rescue Engine",
        "corridor": "Bhadrak (BHC, 0.0km) -> Puri (PURI, 206.0km)",
        "version": settings.VERSION,
        "docs_url": "/docs",
        "openapi_url": "/openapi.json",
        "health_check": "/api/v1/health",
        "topology": "/api/v1/corridor/topology",
        "state": "/api/v1/corridor/state",
        "websocket": "/ws/corridor",
    }
