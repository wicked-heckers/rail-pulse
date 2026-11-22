import json
import logging
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np

from app.config import BASE_DIR
from app.engine.survival_math import compute_survival_probability
from app.models.schemas import QuantileFeatureVector, QuantileResult

logger = logging.getLogger("railpulse.quantile_ml")


class QuantileMLEngine:
    """
    LightGBM Physics-Guided Residual Quantile Engine with Split Conformal (CQR) Calibration.
    Combines deterministic physics baseline with ML residual uncertainty bands,
    enforcing CQR coverage, monotonic non-crossing, and distance-scaled spread guarantees.
    """

    _p10_model: lgb.Booster | None = None
    _p50_model: lgb.Booster | None = None
    _p90_model: lgb.Booster | None = None
    _features: list[str] = [
        "current_delay_mins",
        "sim_freight_penalty_mins",
        "sim_overtake_hold_mins",
        "sim_overtake_count",
        "usable_slack_mins",
        "freight_shadow_prob",
        "remaining_distance_km",
        "remaining_commercial_halts",
        "train_priority_rank",
        "rain_mm_hr",
        "is_peak_hour",
        "downstream_junction_load",
    ]
    _q_cqr: float = 0.5898

    @classmethod
    def is_loaded(cls) -> bool:
        return cls._p10_model is not None and cls._p50_model is not None and cls._p90_model is not None

    @classmethod
    def load_models(cls, artifacts_dir: Path | None = None) -> bool:
        if cls._p10_model is not None and cls._p50_model is not None and cls._p90_model is not None:
            return True

        target_dir = artifacts_dir or (BASE_DIR / "ml" / "artifacts")

        # Load feature schema and CQR calibration if present
        schema_path = target_dir / "feature_schema.json"
        cqr_path = target_dir / "cqr_calibration.json"

        if schema_path.exists():
            try:
                with open(schema_path) as f:
                    cls._features = json.load(f).get("features", cls._features)
            except Exception as e:
                logger.warning("Could not read feature_schema.json: %s", e)

        if cqr_path.exists():
            try:
                with open(cqr_path) as f:
                    cls._q_cqr = float(json.load(f).get("q_cqr", cls._q_cqr))
            except Exception as e:
                logger.warning("Could not read cqr_calibration.json: %s", e)

        # Check for upgraded lgbm_p*.txt or fallback to p*.txt
        if (target_dir / "lgbm_p10.txt").exists():
            p10_path = target_dir / "lgbm_p10.txt"
            p50_path = target_dir / "lgbm_p50.txt"
            p90_path = target_dir / "lgbm_p90.txt"
        else:
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
            logger.info(
                "Loaded LightGBM quantile boosters successfully from %s (CQR q=%.4f)",
                target_dir,
                cls._q_cqr,
            )
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
        Runs residual quantile inference with CQR calibration,
        resolves quantile crossing, and enforces distance-spread floors.
        """
        models_loaded = cls.load_models()

        # Map input features to the locked 12-feature schema
        overtake_hold = features.sim_overtake_hold_mins or (features.overtake_mins or 0.0)
        overtake_count = features.sim_overtake_count or (features.overtake_count or 0)
        freight_prob = features.freight_shadow_prob if features.freight_shadow_prob > 0 else (features.freight_probability or 0.0)
        rem_km = features.remaining_distance_km if features.remaining_distance_km > 0 else (features.remaining_km or 0.0)
        rem_halts = features.remaining_commercial_halts if features.remaining_commercial_halts > 0 else (features.remaining_halts or 0)
        is_peak = features.is_peak_hour if features.is_peak_hour in (0, 1) else (1 if features.hour_of_day in (8, 9, 10, 11, 17, 18, 19, 20) else 0)
        junc_load = features.downstream_junction_load if features.downstream_junction_load > 0 else (
            features.junction_congestion_idx * 5.0 if features.junction_congestion_idx else 2.0
        )

        # Baseline delay calculation
        p50_base = features.p50_base_delay_mins if features.p50_base_delay_mins > 0 else max(
            0.0,
            features.current_delay_mins + features.sim_freight_penalty_mins + overtake_hold - 0.6 * features.usable_slack_mins,
        )

        if models_loaded and cls._p10_model and cls._p50_model and cls._p90_model:
            # Check number of features expected by the booster
            num_expected = cls._p50_model.num_feature()
            if num_expected == 12:
                feat_dict = {
                    "current_delay_mins": features.current_delay_mins,
                    "sim_freight_penalty_mins": features.sim_freight_penalty_mins,
                    "sim_overtake_hold_mins": overtake_hold,
                    "sim_overtake_count": overtake_count,
                    "usable_slack_mins": features.usable_slack_mins,
                    "freight_shadow_prob": freight_prob,
                    "remaining_distance_km": rem_km,
                    "remaining_commercial_halts": rem_halts,
                    "train_priority_rank": features.train_priority_rank,
                    "rain_mm_hr": features.rain_mm_hr,
                    "is_peak_hour": is_peak,
                    "downstream_junction_load": junc_load,
                }
                feat_array = np.array([[float(feat_dict.get(k, 0.0)) for k in cls._features]], dtype=np.float32)
            else:
                # 11-feature fallback for older models
                feat_array = np.array([[
                    features.current_delay_mins,
                    p50_base,
                    freight_prob,
                    overtake_count,
                    overtake_hold,
                    rem_km,
                    rem_halts,
                    features.usable_slack_mins,
                    features.rain_mm_hr,
                    features.hour_of_day,
                    features.junction_congestion_idx or 0.0,
                ]], dtype=np.float32)

            r10 = float(cls._p10_model.predict(feat_array)[0])
            r50 = float(cls._p50_model.predict(feat_array)[0])
            r90 = float(cls._p90_model.predict(feat_array)[0])

            # Apply Split Conformal Quantile Regression (CQR) margin
            q_cqr = cls._q_cqr if num_expected == 12 else 0.0
            raw_p10 = max(-10.0, p50_base + r10 - q_cqr)
            raw_p50 = max(0.0, p50_base + r50)
            raw_p90 = max(0.0, p50_base + r90 + q_cqr)
        else:
            # Analytical fallback if model weights missing
            base_uncertainty = max(3.0, rem_km * 0.08)
            raw_p10 = max(-10.0, p50_base - base_uncertainty * 0.5)
            raw_p50 = max(0.0, p50_base)
            raw_p90 = max(0.0, p50_base + base_uncertainty)

        # 1. Monotonicity Guard (P10 <= P50 <= P90)
        p10, p50, p90 = sorted([raw_p10, raw_p50, raw_p90])

        # 2. Distance-Scaled Minimum Spread Guarantee
        min_spread = max(5.0, rem_km * 0.10)
        p10 = min(p10, max(-10.0, p50 - min_spread))
        p90 = max(p90, p50 + min_spread)

        p10 = round(float(p10), 1)
        p50 = round(float(p50), 1)
        p90 = round(float(p90), 1)

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
    sched_arr_epoch: int | None = None,
) -> float:
    """
    Computes connection survival probability using the Asymmetric Two-Piece Normal CDF.
    - cutoff_epoch = connection_deadline_utc - transfer_buffer_secs
    - Maps epochs to delay space relative to sched_arr_epoch or relative spread.
    """
    # Baseline for delay conversion
    base_epoch = sched_arr_epoch if (sched_arr_epoch and sched_arr_epoch > 0) else (p50_epoch - 30 * 60)

    p10_delay = (p10_epoch - base_epoch) / 60.0
    p50_delay = (p50_epoch - base_epoch) / 60.0
    p90_delay = (p90_epoch - base_epoch) / 60.0
    max_tolerable_delay = (cutoff_epoch - base_epoch) / 60.0

    return compute_survival_probability(
        p10_delay_mins=p10_delay,
        p50_delay_mins=p50_delay,
        p90_delay_mins=p90_delay,
        max_tolerable_delay_mins=max_tolerable_delay,
    )
