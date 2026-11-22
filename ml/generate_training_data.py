import csv
import random
from pathlib import Path

import numpy as np


def generate_ecor_cascade_dataset(
    output_path: Path, num_samples: int = 5000, seed: int = 42
) -> None:
    """
    Generates a realistic dataset of train trips on the ECoR corridor,
    capturing cascade delays, loop-line overtakes, phantom freight drag,
    monsoon weather variance, and timetable recovery slack.
    """
    random.seed(seed)
    np.random.seed(seed)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    headers = [
        "current_delay_mins",
        "p50_base_delay_mins",
        "freight_probability",
        "overtake_count",
        "overtake_mins",
        "remaining_km",
        "remaining_halts",
        "usable_slack_mins",
        "rain_mm_hr",
        "hour_of_day",
        "junction_congestion_idx",
        "actual_residual_delay",  # Target: y_actual - p50_base
    ]

    rows = []
    for _ in range(num_samples):
        remaining_km = round(random.uniform(10.0, 206.0), 1)
        remaining_halts = max(1, int(remaining_km / 25.0))
        current_delay = round(float(np.random.exponential(scale=18.0)), 1)  # Real delay distribution is right-skewed
        current_delay = min(150.0, current_delay)

        # Overtakes: more likely if current delay is high
        if current_delay > 20.0 and random.random() < 0.65:
            overtake_count = random.choice([1, 1, 1, 2])
            overtake_mins = round(overtake_count * random.uniform(14.0, 18.0), 1)
        else:
            overtake_count = 0
            overtake_mins = 0.0

        # Freight probability: higher near Barang & Jakhapura
        is_freight_zone = random.random() < 0.40
        freight_prob = round(random.uniform(0.60, 0.95), 2) if is_freight_zone else round(random.uniform(0.0, 0.35), 2)
        freight_drag = round(freight_prob * random.uniform(8.0, 18.0), 1) if freight_prob > 0.50 else 0.0

        # Weather: dry mostly, occasional monsoon shower
        is_rainy = random.random() < 0.25
        rain_mm_hr = round(random.uniform(5.0, 35.0), 1) if is_rainy else 0.0

        # Timetable recovery slack
        max_possible_slack = 35.0 * (remaining_km / 206.0)
        usable_slack = round(max_possible_slack * (0.75 if (rain_mm_hr > 10 or freight_prob > 0.6) else 1.0), 1)

        hour_of_day = random.randint(0, 23)
        # Peak congestion hours: 8-11 AM and 5-8 PM
        is_peak = (8 <= hour_of_day <= 11) or (17 <= hour_of_day <= 20)
        junction_congestion = round(random.uniform(0.60, 0.95), 2) if is_peak else round(random.uniform(0.10, 0.45), 2)

        # Deterministic physics baseline
        p50_base = max(0.0, round(current_delay + overtake_mins + freight_drag - usable_slack, 1))

        # Real world stochastic residual variation:
        # 1. Weather friction adds positive residual
        weather_res = (rain_mm_hr / 10.0) * random.uniform(0.8, 2.2)
        # 2. Junction congestion jitter
        junction_res = junction_congestion * random.uniform(-1.0, 4.0)
        # 3. Distance uncertainty spread
        distance_spread = (remaining_km / 50.0) * random.gauss(0, 1.5)
        # 4. Human controller discretion
        controller_variance = random.gauss(0, 2.0)

        actual_residual = round(weather_res + junction_res + distance_spread + controller_variance, 2)

        rows.append([
            current_delay,
            p50_base,
            freight_prob,
            overtake_count,
            overtake_mins,
            remaining_km,
            remaining_halts,
            usable_slack,
            rain_mm_hr,
            hour_of_day,
            junction_congestion,
            actual_residual,
        ])

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parent.parent
    data_file = base_dir / "data" / "ecor_cascade_training_data.csv"
    generate_ecor_cascade_dataset(data_file)
    print(f"Generated training dataset with 5,000 samples at {data_file}")
