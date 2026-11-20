from typing import Any

from app.models.schemas import FreightInferenceResult


def compute_str(actual_run_mins: float, free_flow_mins: float) -> float:
    """Computes Sectional Traversal Ratio (STR) = T_actual / T_free_flow."""
    if free_flow_mins <= 0.0:
        return 1.0
    return round(actual_run_mins / free_flow_mins, 2)


def evaluate_freight_probability(
    block: dict[str, Any],
    str_value: float,
    head_gap_mins: float | None = None,
    block_history: list[float] | None = None,
    rain_mm_hr: float = 0.0,
    ulip_confirmed: bool = False,
    stations: list[dict[str, Any]] | None = None,
) -> FreightInferenceResult:
    """
    Evaluates kinematic STR against 4 exclusion gates and Bayesian industrial priors
    to detect Phantom Freight rakes.
    """
    block_id = block["block_id"]
    direction = block["direction"]
    history = block_history or []

    # 1. Enterprise Override (ULIP FOIS)
    if ulip_confirmed:
        clearance_stn, clearance_eta = _find_clearance_loop(block, stations)
        return FreightInferenceResult(
            block_id=block_id,
            direction=direction,
            str_value=str_value,
            freight_probability=1.0,
            status="ULIP_FOIS_CONFIRMED",
            clearance_station=clearance_stn,
            clearance_eta_mins=clearance_eta,
        )

    # Effective STR threshold (Weather Discount Gate)
    effective_str_threshold = 1.50
    if rain_mm_hr > 15.0:
        effective_str_threshold = 1.70  # Higher threshold required during monsoon braking

    # Gate A: Normal Speed
    if str_value < effective_str_threshold:
        return FreightInferenceResult(
            block_id=block_id,
            direction=direction,
            str_value=str_value,
            freight_probability=0.05,
            status="NORMAL_SPEED",
        )

    # Gate B: Visible Coaching Congestion
    if head_gap_mins is not None and head_gap_mins < 15.0:
        return FreightInferenceResult(
            block_id=block_id,
            direction=direction,
            str_value=str_value,
            freight_probability=0.15,
            status="COACHING_CONGESTION",
        )

    # Gate C: Static TSR / Track Maintenance Filter
    # If 3 or more consecutive trains have experienced STR >= 1.50 on this block, it's a static TSR
    high_str_count = sum(1 for past_str in history[-4:] if past_str >= 1.50)
    if high_str_count >= 2:
        return FreightInferenceResult(
            block_id=block_id,
            direction=direction,
            str_value=str_value,
            freight_probability=0.10,
            status="STATIC_TSR_OR_SIGNAL_FAULT",
        )

    # Gate D: Bayesian Industrial Prior Fusion
    prior_weight = float(block.get("freight_injection_weight", 0.15))
    kinematic_score = min(1.0, max(0.0, (str_value - effective_str_threshold) / 1.50))

    # Posterior Bayesian formulation
    numerator = prior_weight * (0.5 + 0.5 * kinematic_score)
    denominator = numerator + (1.0 - prior_weight) * (1.0 - kinematic_score)
    posterior_prob = round(numerator / max(0.001, denominator), 2)

    status: Any = (
        "PHANTOM_FREIGHT_SHADOW" if posterior_prob >= 0.55 else "NORMAL_SPEED"
    )

    clearance_stn, clearance_eta = None, None
    if status == "PHANTOM_FREIGHT_SHADOW":
        clearance_stn, clearance_eta = _find_clearance_loop(block, stations)

    return FreightInferenceResult(
        block_id=block_id,
        direction=direction,
        str_value=str_value,
        freight_probability=posterior_prob,
        status=status,
        clearance_station=clearance_stn,
        clearance_eta_mins=clearance_eta,
    )


def _find_clearance_loop(
    block: dict[str, Any], stations: list[dict[str, Any]] | None
) -> tuple[str | None, float | None]:
    """Finds the next station with a 750m goods loop and computes clearance time."""
    if not stations:
        return block["to_station"], 12.0

    direction = block["direction"]
    block_end_km = block["end_km"]

    # Filter downstream stations
    if direction == "DN":
        candidates = [s for s in stations if s["chainage_km"] >= block_end_km and s["has_750m_goods_loop"]]
        candidates.sort(key=lambda s: s["chainage_km"])
    else:
        candidates = [s for s in stations if s["chainage_km"] <= block_end_km and s["has_750m_goods_loop"]]
        candidates.sort(key=lambda s: s["chainage_km"], reverse=True)

    if not candidates:
        return block["to_station"], 15.0

    target_stn = candidates[0]
    dist_km = abs(target_stn["chainage_km"] - block_end_km)
    
    # 30 km/h freight crawl speed + 6m loop entry + 5m starter signal clearance
    crawl_mins = (dist_km / 30.0) * 60.0
    total_clearance_mins = round(crawl_mins + 11.0, 1)

    return target_stn["station_code"], total_clearance_mins
