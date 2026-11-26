import json
import logging
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import ClassVar
from zoneinfo import ZoneInfo

import lightgbm as lgb
import numpy as np

from app.config import BASE_DIR
from app.engine.survival_math import compute_survival_probability
from app.models.schemas import (
    QuantileFeatureVector,
    QuantileResult,
    SimulationResult,
    StationArrival,
    TrainKinematicState,
)

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
    _features: ClassVar[list[str]] = [
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
            except (OSError, json.JSONDecodeError, ValueError) as e:
                logger.warning("Could not read feature_schema.json: %s", e)

        if cqr_path.exists():
            try:
                with open(cqr_path) as f:
                    cls._q_cqr = float(json.load(f).get("q_cqr", cls._q_cqr))
            except (OSError, json.JSONDecodeError, ValueError) as e:
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
        except (lgb.basic.LightGBMError, OSError) as e:
            logger.error("Failed to load LightGBM boosters: %s", e)
            return False

    @classmethod
    def _prepare_row_and_base(
        cls,
        features: QuantileFeatureVector,
        num_expected: int,
    ) -> tuple[list[float], float, float]:
        """Normalizes QuantileFeatureVector aliases into a model row, p50_base, and rem_km."""
        overtake_hold = (
            features.sim_overtake_hold_mins
            if features.sim_overtake_hold_mins is not None
            else (features.overtake_mins if features.overtake_mins is not None else 0.0)
        )
        overtake_count = (
            features.sim_overtake_count
            if features.sim_overtake_count is not None
            else (features.overtake_count if features.overtake_count is not None else 0)
        )
        freight_prob = (
            features.freight_shadow_prob
            if features.freight_shadow_prob > 0
            else (features.freight_probability if features.freight_probability is not None else 0.0)
        )
        rem_km = (
            features.remaining_distance_km
            if features.remaining_distance_km > 0
            else (features.remaining_km if features.remaining_km is not None else 0.0)
        )
        rem_halts = (
            features.remaining_commercial_halts
            if features.remaining_commercial_halts > 0
            else (features.remaining_halts if features.remaining_halts is not None else 0)
        )
        is_peak = (
            features.is_peak_hour
            if features.is_peak_hour in (0, 1)
            else (1 if features.hour_of_day in (8, 9, 10, 11, 17, 18, 19, 20) else 0)
        )
        junc_load = (
            features.downstream_junction_load
            if features.downstream_junction_load > 0
            else (features.junction_congestion_idx * 5.0 if features.junction_congestion_idx else 2.0)
        )

        p50_base = (
            features.p50_base_delay_mins
            if features.p50_base_delay_mins > 0
            else max(
                0.0,
                features.current_delay_mins
                + features.sim_freight_penalty_mins
                + overtake_hold
                - 0.6 * features.usable_slack_mins,
            )
        )

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
            row = [float(feat_dict.get(k, 0.0)) for k in cls._features]
        else:
            row = [
                float(features.current_delay_mins),
                float(p50_base),
                float(freight_prob),
                float(overtake_count),
                float(overtake_hold),
                float(rem_km),
                float(rem_halts),
                float(features.usable_slack_mins),
                float(features.rain_mm_hr),
                float(features.hour_of_day),
                float(features.junction_congestion_idx or 0.0),
            ]
        return row, float(p50_base), float(rem_km)

    @staticmethod
    def _is_undisrupted(features: QuantileFeatureVector, p50_base: float, rem_km: float = 1.0) -> bool:
        if rem_km <= 0.0:
            return True
        return (
            p50_base <= 0.0
            and features.current_delay_mins <= 0.0
            and features.sim_freight_penalty_mins <= 0.0
            and (features.sim_overtake_hold_mins or 0.0) <= 0.0
            and (features.overtake_mins or 0.0) <= 0.0
            and features.rain_mm_hr <= 0.0
            and features.freight_shadow_prob <= 0.0
        )

    @staticmethod
    def _finalize_quantiles(
        p50_base: float,
        rem_km: float,
        residuals: tuple[float, float, float] | None,
        q_cqr: float,
        sched_arr_epoch: int,
        undisrupted: bool = False,
        overtake_active: bool = False,
    ) -> QuantileResult:
        """Applies CQR margins, monotonicity guard, and distance-scaled minimum spread."""
        if undisrupted:
            raw_p10 = p50_base
            raw_p50 = p50_base
            raw_p90 = p50_base
        elif residuals is not None:
            r10, r50, r90 = residuals
            r50_scale = 0.65 if overtake_active else 0.15
            raw_p10 = max(-10.0, p50_base + r10 - q_cqr)
            raw_p50 = max(0.0, p50_base + max(0.0, r50) * r50_scale)
            raw_p90 = max(0.0, p50_base + r90 + q_cqr)
        else:
            base_uncertainty = max(3.0, rem_km * 0.08)
            raw_p10 = max(-10.0, p50_base - base_uncertainty * 0.5)
            raw_p50 = max(0.0, p50_base)
            raw_p90 = max(0.0, p50_base + base_uncertainty)

        p10, p50, p90 = sorted([raw_p10, raw_p50, raw_p90])

        min_spread = max(3.0, rem_km * 0.08) if undisrupted else max(5.0, rem_km * 0.10)
        p10 = min(p10, max(-10.0, p50 - min_spread))
        p90 = max(p90, p50 + min_spread)

        p10 = round(float(p10), 1)
        p50 = round(float(p50), 1)
        p90 = round(float(p90), 1)

        return QuantileResult(
            p10_delay_mins=p10,
            p50_delay_mins=p50,
            p90_delay_mins=p90,
            p10_eta_epoch=sched_arr_epoch + int(p10 * 60),
            p50_eta_epoch=sched_arr_epoch + int(p50 * 60),
            p90_eta_epoch=sched_arr_epoch + int(p90 * 60),
            min_spread_applied=round(min_spread, 2),
        )

    @classmethod
    def predict_batch(
        cls,
        items: list[tuple[QuantileFeatureVector, int]],
    ) -> list[QuantileResult]:
        """
        Vectorized batch inference across N trains in a single LightGBM call per quantile,
        avoiding per-train GIL/C-API overhead.
        """
        if not items:
            return []

        models_loaded = cls.load_models()
        has_models = bool(models_loaded and cls._p10_model and cls._p50_model and cls._p90_model)
        num_expected = cls._p50_model.num_feature() if has_models and cls._p50_model else 12
        q_cqr = cls._q_cqr if (has_models and num_expected == 12) else 0.0

        prepared = [
            (*cls._prepare_row_and_base(feat, num_expected), feat)
            for feat, _ in items
        ]
        rows = [p[0] for p in prepared]

        if has_models and cls._p10_model and cls._p50_model and cls._p90_model:
            feat_matrix = np.array(rows, dtype=np.float32)
            preds_10 = cls._p10_model.predict(feat_matrix)
            preds_50 = cls._p50_model.predict(feat_matrix)
            preds_90 = cls._p90_model.predict(feat_matrix)
            return [
                cls._finalize_quantiles(
                    p50_base=p50_base,
                    rem_km=rem_km,
                    residuals=(float(preds_10[idx]), float(preds_50[idx]), float(preds_90[idx])),
                    q_cqr=q_cqr,
                    sched_arr_epoch=sched_arr_epoch,
                    undisrupted=cls._is_undisrupted(feat, p50_base, rem_km),
                    overtake_active=bool((feat.sim_overtake_hold_mins or feat.overtake_mins or 0.0) > 0.0),
                )
                for idx, ((_, p50_base, rem_km, feat), (_, sched_arr_epoch)) in enumerate(
                    zip(prepared, items, strict=True)
                )
            ]

        return [
            cls._finalize_quantiles(
                p50_base=p50_base,
                rem_km=rem_km,
                residuals=None,
                q_cqr=0.0,
                sched_arr_epoch=sched_arr_epoch,
                undisrupted=cls._is_undisrupted(feat, p50_base, rem_km),
            )
            for (_, p50_base, rem_km, feat), (_, sched_arr_epoch) in zip(prepared, items, strict=True)
        ]

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
        return cls.predict_batch([(features, sched_arr_epoch)])[0]


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


def build_quantile_feature_vector(
    train_state: TrainKinematicState,
    sim_result: SimulationResult | None,
    adjusted_timeline: list[StationArrival],
    target_arrival: StationArrival | None,
    remaining_km: float,
    freight_shadow_prob: float = 0.0,
    rain_mm_hr: float = 0.0,
    current_epoch: int | None = None,
) -> QuantileFeatureVector:
    """Builds a unified 12-feature QuantileFeatureVector from simulation and corridor state."""
    ist_dt = datetime.fromtimestamp(current_epoch or int(time.time()), tz=UTC).astimezone(
        ZoneInfo("Asia/Kolkata")
    )
    hour_of_day = ist_dt.hour
    is_peak = 1 if hour_of_day in (8, 9, 10, 11, 17, 18, 19, 20) else 0

    # Scope timeline/overtake/freight features up to and including target_arrival
    if target_arrival is not None:
        target_km = target_arrival.chainage_km
        is_up = train_state.direction == "UP"
        scoped_timeline = [
            a
            for a in adjusted_timeline
            if (a.chainage_km >= target_km - 0.1 if is_up else a.chainage_km <= target_km + 0.1)
        ]
        sim_stn_km = (
            {a.station_code: a.chainage_km for a in sim_result.timeline}
            if sim_result
            else {}
        )
        def _before_or_at_target(stn_code: str) -> bool:
            if stn_code not in sim_stn_km:
                return True
            km = sim_stn_km[stn_code]
            return km >= target_km - 0.1 if is_up else km <= target_km + 0.1
    else:
        scoped_timeline = list(adjusted_timeline)
        def _before_or_at_target(_stn_code: str) -> bool:
            return True

    usable_slack = sum(max(0.0, a.raw_sim_delay_mins - a.net_delay_mins) for a in scoped_timeline)
    freight_penalty = (
        sum(
            c.added_delay_mins
            for c in sim_result.causal_cards
            if c.event == "FREIGHT_SHADOW_DRAG" and _before_or_at_target(c.station_code)
        )
        if sim_result
        else 0.0
    )
    if sim_result:
        overtake_cards = [
            c
            for c in sim_result.causal_cards
            if c.event in ("PRIORITY_OVERTAKE_HOLD", "CASCADE_DOUBLE_OVERTAKE")
            and _before_or_at_target(c.station_code)
        ]
        overtake_count = len(overtake_cards) if target_arrival is not None else sim_result.overtakes_count
        overtake_hold = (
            sum(c.added_delay_mins for c in overtake_cards)
            if target_arrival is not None
            else sim_result.total_loop_hold_mins
        )
    else:
        overtake_count = 0
        overtake_hold = 0.0
    p50_base_delay = target_arrival.net_delay_mins if target_arrival else train_state.current_delay_mins
    junction_load = round(1.5 + (2.5 if is_peak else 0.0) + min(1.0, max(0.0, freight_shadow_prob)), 2)

    return QuantileFeatureVector(
        current_delay_mins=train_state.current_delay_mins,
        sim_freight_penalty_mins=freight_penalty,
        sim_overtake_hold_mins=overtake_hold,
        sim_overtake_count=overtake_count,
        usable_slack_mins=usable_slack,
        freight_shadow_prob=freight_shadow_prob,
        remaining_distance_km=remaining_km,
        remaining_commercial_halts=len(scoped_timeline),
        train_priority_rank=train_state.priority_rank,
        rain_mm_hr=rain_mm_hr,
        is_peak_hour=is_peak,
        downstream_junction_load=junction_load,
        p50_base_delay_mins=p50_base_delay,
        freight_probability=freight_shadow_prob,
        overtake_count=overtake_count,
        overtake_mins=overtake_hold,
        remaining_km=remaining_km,
        remaining_halts=len(adjusted_timeline),
        hour_of_day=hour_of_day,
    )
