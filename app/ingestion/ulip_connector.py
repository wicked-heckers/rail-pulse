import logging
from typing import Any

from app.core.state_store import state_store
from app.models.schemas import FreightInferenceResult

logger = logging.getLogger("railpulse.ulip_connector")


class ULIPFoisEnterpriseConnector:
    """
    PM GatiShakti ULIP FOIS Enterprise Rake State Adapter.
    Allows authenticated industrial/port freight telemetry to inject
    confirmed freight rake positions, overriding kinematic inference.
    """

    @classmethod
    async def process_freight_telemetry(
        cls,
        payload: dict[str, Any],
    ) -> FreightInferenceResult:
        """
        Processes enterprise telemetry payload:
        {rake_id, block_id, direction, speed_kmph, timestamp_utc}
        """
        block_id = payload["block_id"]
        direction = payload.get("direction", "DN")
        speed_kmph = float(payload.get("speed_kmph", 30.0))

        # Confirmed freight rake overrides kinematic inference
        result = FreightInferenceResult(
            block_id=block_id,
            direction=direction,
            str_value=2.20,
            freight_probability=1.0,
            status="ULIP_FOIS_CONFIRMED",
            clearance_station=block_id.split("_")[-1] if "_" in block_id else "BRAG",
            clearance_eta_mins=12.0,
        )

        # Update in-memory state store immediately
        await state_store.update_freight_shadows([result])
        await state_store.inject_freight_shadow(block_id, penalty_mins=18.0)

        logger.info(
            "ULIP FOIS Confirmed Freight Override on block %s at %s km/h",
            block_id,
            speed_kmph,
        )
        return result

    # Class-level alias
    ingest_telemetry_payload = process_freight_telemetry

