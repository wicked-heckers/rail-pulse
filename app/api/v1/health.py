import time

from fastapi import APIRouter, Depends

from app.api.deps import (
    CorridorStateStore,
    RedisCircuitBreakerClient,
    get_redis_client,
    get_state_store,
)
from app.config import settings
from app.engine.quantile_ml import QuantileMLEngine
from app.models.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(
    state_store: CorridorStateStore = Depends(get_state_store),
    redis_client: RedisCircuitBreakerClient = Depends(get_redis_client),
) -> HealthResponse:
    """
    Returns operational health status of RAIL-PULSE services, ML engine, and state mirror.
    """
    # Check ML models
    ml_loaded = QuantileMLEngine.is_loaded()
    if not ml_loaded:
        ml_loaded = QuantileMLEngine.load_models()

    # Check Redis connectivity or fallback state
    redis_ok = await redis_client.is_healthy()
    redis_status = "CONNECTED" if redis_ok else "CIRCUIT_BREAKER_ACTIVE_IN_MEMORY"

    # Get active train count and current provider mode
    active_trains = await state_store.get_active_trains()
    active_provider = await state_store.get_provider_mode()

    return HealthResponse(
        status="HEALTHY",
        environment=settings.ENVIRONMENT,
        database="POSTGIS_ACTIVE_OR_FALLBACK_READY",
        redis=redis_status,
        active_provider=active_provider,
        ml_models_loaded=ml_loaded,
        active_trains_count=len(active_trains),
        timestamp_epoch=int(time.time()),
    )
