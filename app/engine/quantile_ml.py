import logging
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np

from app.config import BASE_DIR
from app.models.schemas import QuantileFeatureVector, QuantileResult

logger = logging.getLogger("railpulse.quantile_ml")


class QuantileMLEngine:
    """
    LightGBM Physics-Guided Residual Quantile Engine.
    Combines deterministic physics baseline with ML residual uncertainty bands,
    enforcing monotonic non-crossing and distance-scaled spread guarantees.
    """

    _p10_model: lgb.Booster | None = None
    _p50_model: lgb.Booster | None = None
    _p90_model: lgb.Booster | None = None

    @classmethod
    def load_models(cls, artifacts_dir: Path | None = None) -> bool:
        if cls._p10_model is not None and cls._p50_model is not None and cls._p90_model is not None:
            return True

        target_dir = artifacts_dir or (BASE_DIR / "ml" / "artifacts")
        p10_path = target_dir / "p10.txt"
        p50_path = target_dir / "p50.txt"
        p90_path = target_dir / "p90.txt"

        if not (p10_path.exists() and p50_path.exists() and p90_path.exists()):
            logger.warning("Quantile models not found at %s. Using analytical spread fallback.", target_dir)
            return False

        try:
            cls._p10_model = lgb.Booster(model_file=str(p10_path))
            cls._p50_model = lgb.Booster(model_file=str(p50_path))
            cls._p90_model = lgb.Booster(model_file=str(p90_path))
            logger.info("Loaded LightGBM quantile boosters successfully from %s", target_dir)
            return True
        except Exception as e:
            logger.error("Failed to load LightGBM boosters: %s", e)
            return False

    @classmethod
    def predict(
        cls,
        features: QuantileFeatureVector,
        sched_arr_epoch: int,
    ) -> QuantileResult:
        """
        Runs residual quantile inference, resolves quantile crossing,
        and enforces distance-spread floors.
        """
        p50_base = features.p50_base_delay_mins
        remaining_km = features.remaining_km

        models_loaded = cls.load_models()

        if models_loaded and cls._p10_model and cls._p50_model and cls._p90_model:
            feat_array = np.array([[
                features.current_delay_mins,
                features.p50_base_delay_mins,
                features.freight_probability,
                features.overtake_count,
                features.overtake_mins,
                features.remaining_km,
                features.remaining_halts,
                features.usable_slack_mins,
                features.rain_mm_hr,
                features.hour_of_day,
                features.junction_congestion_idx,
            ]])

            r10 = float(cls._p10_model.predict(feat_array)[0])
            r50 = float(cls._p50_model.predict(feat_array)[0])
            r90 = float(cls._p90_model.predict(feat_array)[0])
        else:
            # Analytical fallback if model weights missing
            base_uncertainty = max(3.0, remaining_km * 0.08)
            r10 = -base_uncertainty * 0.5
            r50 = 0.0
            r90 = base_uncertainty

        raw_p10 = max(0.0, p50_base + r10)
        raw_p50 = max(0.0, p50_base + r50)
        raw_p90 = max(0.0, p50_base + r90)

        # 1. Monotonicity Guard (Post-Inference Sorting)
        p10, p50, p90 = sorted([raw_p10, raw_p50, raw_p90])

        # 2. Distance-Scaled Minimum Spread Guarantee
        min_spread = max(3.0, remaining_km * 0.06)
        p10 = min(p10, max(0.0, p50 - min_spread * 0.5))
        p90 = max(p90, p50 + min_spread)

        p10 = round(p10, 1)
        p50 = round(p50, 1)
        p90 = round(p90, 1)

        p10_eta = sched_arr_epoch + int(p10 * 60)
        p50_eta = sched_arr_epoch + int(p50 * 60)
        p90_eta = sched_arr_epoch + int(p90 * 60)

        return QuantileResult(
            p10_delay_mins=p10,
            p50_delay_mins=p50,
            p90_delay_mins=p90,
            p10_eta_epoch=p10_eta,
            p50_eta_epoch=p50_eta,
            p90_eta_epoch=p90_eta,
            min_spread_applied=round(min_spread, 2),
        )


def calculate_connection_survival(
    cutoff_epoch: int,
    p10_epoch: int,
    p50_epoch: int,
    p90_epoch: int,
) -> float:
    """
    Interpolates connection survival probability across the piecewise P10 / P50 / P90 CDF.
    - cutoff_epoch = connection_deadline_utc - transfer_buffer_secs
    - Returns a float between 0.01 and 0.99.
    """
    if cutoff_epoch <= p10_epoch:
        # Before or at P10: severe risk of missing
        if p10_epoch == 0:
            return 0.10
        deficit = p10_epoch - cutoff_epoch
        # Drop rapidly towards 1% as deadline passes before P10
        return max(0.01, round(0.10 * math_exp_decay(deficit / 600.0), 3))

    elif p10_epoch < cutoff_epoch <= p50_epoch:
        # Between P10 and P50 (survival 10% to 50%)
        span = max(1, p50_epoch - p10_epoch)
        ratio = (cutoff_epoch - p10_epoch) / span
        return round(0.10 + 0.40 * ratio, 3)

    elif p50_epoch < cutoff_epoch <= p90_epoch:
        # Between P50 and P90 (survival 50% to 90%)
        span = max(1, p90_epoch - p50_epoch)
        ratio = (cutoff_epoch - p50_epoch) / span
        return round(0.50 + 0.40 * ratio, 3)

    else:
        # Beyond P90: high probability of connection success
        surplus = cutoff_epoch - p90_epoch
        bonus = min(0.09, (surplus / 1800.0) * 0.09)
        return round(0.90 + bonus, 3)


def math_exp_decay(x: float) -> float:
    """Helper for exponential decay without math overflow."""
    import math
    return math.exp(-min(5.0, max(0.0, x)))
