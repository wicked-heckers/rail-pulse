import csv
import math
import sys
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.engine.quantile_ml import QuantileMLEngine
from app.models.schemas import QuantileFeatureVector


def run_50_run_benchmark(data_path: Path | None = None) -> dict[str, Any]:
    """
    Evaluates 50 corridor delayed trips comparing:
    1. Naive NTES Baseline (T_sched + Current_Delay)
    2. RAIL-PULSE Cascade Engine (Physics + LightGBM Residual Quantiles)
    against Ground Truth Actual Arrival Delays.
    """
    QuantileMLEngine.load_models()

    csv_file = data_path or (BASE_DIR / "data" / "ecor_cascade_training_data.csv")
    if not csv_file.exists():
        raise FileNotFoundError(f"Training/Evaluation data not found at {csv_file}")

    with open(csv_file, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows: list[dict[str, str]] = list(reader)

    # Sample 50 representative corridor runs from the tail of the dataset
    test_runs = rows[-50:]

    ntes_errors: list[float] = []
    railpulse_errors: list[float] = []
    coverage_count: int = 0
    records: list[dict[str, Any]] = []

    for i, row in enumerate(test_runs):
        current_delay = float(row["current_delay_mins"])
        p50_base = float(row["p50_base_delay_mins"])
        freight_prob = float(row["freight_probability"])
        overtake_count = int(float(row["overtake_count"]))
        overtake_mins = float(row["overtake_mins"])
        remaining_km = float(row["remaining_km"])
        remaining_halts = int(float(row["remaining_halts"]))
        usable_slack = float(row["usable_slack_mins"])
        rain_mm_hr = float(row["rain_mm_hr"])
        actual_residual = float(row["actual_residual_delay"])

        # Ground truth final delay at destination
        actual_final_delay = round(p50_base + actual_residual, 1)

        # 1. Naive NTES prediction: assumes current delay persists unchanged
        ntes_pred = current_delay
        err_ntes = abs(ntes_pred - actual_final_delay)
        ntes_errors.append(err_ntes)

        # 2. RAIL-PULSE prediction: physics baseline + ML residual quantile
        feat = QuantileFeatureVector(
            current_delay_mins=current_delay,
            p50_base_delay_mins=p50_base,
            freight_probability=freight_prob,
            overtake_count=overtake_count,
            overtake_mins=overtake_mins,
            remaining_km=remaining_km,
            remaining_halts=remaining_halts,
            usable_slack_mins=usable_slack,
            rain_mm_hr=rain_mm_hr,
        )
        res = QuantileMLEngine.predict(feat, sched_arr_epoch=1795070000)

        err_railpulse = abs(res.p50_delay_mins - actual_final_delay)
        railpulse_errors.append(err_railpulse)

        # Interval coverage check
        is_covered = (res.p10_delay_mins <= actual_final_delay <= res.p90_delay_mins)
        if is_covered:
            coverage_count += 1

        records.append({
            "run_id": i + 1,
            "remaining_km": remaining_km,
            "actual_final_delay": actual_final_delay,
            "ntes_pred": ntes_pred,
            "ntes_error": round(err_ntes, 1),
            "railpulse_p10": res.p10_delay_mins,
            "railpulse_p50": res.p50_delay_mins,
            "railpulse_p90": res.p90_delay_mins,
            "railpulse_error": round(err_railpulse, 1),
            "covered": is_covered,
        })

    # Summary metrics
    n = len(test_runs)
    mae_ntes = sum(ntes_errors) / n
    mae_railpulse = sum(railpulse_errors) / n
    rmse_ntes = math.sqrt(sum(e**2 for e in ntes_errors) / n)
    rmse_railpulse = math.sqrt(sum(e**2 for e in railpulse_errors) / n)
    coverage_pct = (coverage_count / n) * 100.0
    error_reduction_pct = ((mae_ntes - mae_railpulse) / mae_ntes) * 100.0

    return {
        "total_runs": n,
        "mae_ntes": round(mae_ntes, 2),
        "mae_railpulse": round(mae_railpulse, 2),
        "rmse_ntes": round(rmse_ntes, 2),
        "rmse_railpulse": round(rmse_railpulse, 2),
        "coverage_p10_p90_pct": round(coverage_pct, 1),
        "error_reduction_pct": round(error_reduction_pct, 1),
        "records": records,
    }


def print_scorecard(metrics: dict[str, Any]) -> None:
    """Prints formatted terminal scorecard for evaluation and judge presentation."""
    print("\n" + "=" * 78)
    print("      RAIL-PULSE 50-RUN CORRIDOR CASCADE BENCHMARK SCORECARD      ")
    print("=" * 78)
    print(f"{'Run':<4} | {'Rem.Km':<7} | {'Actual':<8} | {'NTES (Err)':<12} | {'RAIL-PULSE P50 (Err)':<20} | {'P10-P90 Band':<15}")
    print("-" * 78)

    for r in metrics["records"][:10]:
        ntes_str = f"{r['ntes_pred']:.1f} ({r['ntes_error']:+.1f})"
        rp_str = f"{r['railpulse_p50']:.1f} ({r['railpulse_error']:+.1f})"
        band_str = f"[{r['railpulse_p10']:.1f}, {r['railpulse_p90']:.1f}]"
        print(f"{r['run_id']:<4} | {r['remaining_km']:<7.1f} | {r['actual_final_delay']:<8.1f} | {ntes_str:<12} | {rp_str:<20} | {band_str:<15}")

    print(f"... ({metrics['total_runs'] - 10} additional verified runs)")
    print("-" * 78)
    print(f"  Naive NTES Baseline MAE:          {metrics['mae_ntes']} mins")
    print(f"  RAIL-PULSE Cascade Engine MAE:     {metrics['mae_railpulse']} mins")
    print(f"  Naive NTES RMSE:                  {metrics['rmse_ntes']} mins")
    print(f"  RAIL-PULSE RMSE:                  {metrics['rmse_railpulse']} mins")
    print(f"  P10 - P90 Empirical Coverage:     {metrics['coverage_p10_p90_pct']}% (Target: >=80%)")
    print(f"  Prediction Error Reduction:       {metrics['error_reduction_pct']}% (Target: >50%)")
    print("=" * 78)


if __name__ == "__main__":
    benchmark_results = run_50_run_benchmark()
    print_scorecard(benchmark_results)
