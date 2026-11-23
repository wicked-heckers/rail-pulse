from typing import Any

from fastapi import APIRouter, Header, HTTPException, status

from app.config import settings
from app.ingestion.ulip_connector import ULIPFoisEnterpriseConnector
from app.models.schemas import ULIPTelemetryPayload

router = APIRouter(tags=["Webhooks"])


@router.post("/ulip-fois")
async def ingest_ulip_fois_telemetry(
    payload: ULIPTelemetryPayload,
    x_ulip_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Ingests authoritative freight rake telemetry from ULIP / FOIS API.
    Instantly upgrades inferred phantom freight shadows to confirmed rake presence.
    """
    if settings.ULIP_API_KEY and x_ulip_api_key != settings.ULIP_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-ULIP-API-Key header",
        )

    # Accept and apply enterprise payload
    result = await ULIPFoisEnterpriseConnector.ingest_telemetry_payload(payload.model_dump())

    return {
        "status": "ACCEPTED",
        "rake_id": payload.rake_id,
        "block_id": payload.block_id,
        "direction": payload.direction,
        "override_applied": True,
        "inference_result": result.model_dump(),
    }
