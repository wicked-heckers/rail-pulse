import math

Z_90 = 1.2815515655446004


def _norm_cdf(x: float) -> float:
    """Standard normal cumulative distribution function via math.erf."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def compute_survival_probability(
    p10_delay_mins: float,
    p50_delay_mins: float,
    p90_delay_mins: float,
    max_tolerable_delay_mins: float,
) -> float:
    """
    Computes connection survival probability using an Asymmetric Two-Piece Normal CDF.
    Fits left/right standard deviations from P10, P50, P90 quantiles against
    the passenger's maximum tolerable delay cutoff.
    """
    # 1. Compute asymmetric left/right spread from P10/P50/P90
    sigma_left = max((p50_delay_mins - p10_delay_mins) / Z_90, 1.5)
    sigma_right = max((p90_delay_mins - p50_delay_mins) / Z_90, 2.0)

    # 2. Evaluate Two-Piece Normal CDF at the deadline cutoff
    if max_tolerable_delay_mins <= p50_delay_mins:
        z = (max_tolerable_delay_mins - p50_delay_mins) / sigma_left
    else:
        z = (max_tolerable_delay_mins - p50_delay_mins) / sigma_right

    prob = _norm_cdf(z)
    return round(max(0.01, min(0.99, prob)), 3)


if __name__ == "__main__":
    print("15m buffer:", compute_survival_probability(32, 39, 54, 30))
    print("10m buffer:", compute_survival_probability(32, 39, 54, 35))
    print("Safe(+60m):", compute_survival_probability(32, 39, 54, 60))
