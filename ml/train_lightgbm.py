import csv
from pathlib import Path

import lightgbm as lgb
import numpy as np


def train_quantile_models(data_path: Path, artifacts_dir: Path) -> dict[str, str]:
    """
    Trains 3 LightGBM Quantile Regressors (alpha = 0.10, 0.50, 0.90) using Pinball Loss
    to predict residual delay uncertainty bands (P10, P50, P90).
    Exports booster models to text files.
    """
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    # Load dataset
    features = []
    targets = []
    with open(data_path, encoding="utf-8") as f:
        reader = csv.reader(f)
        _ = next(reader)  # Skip header row
        for row in reader:
            features.append([float(val) for val in row[:-1]])
            targets.append(float(row[-1]))

    x = np.array(features)
    y = np.array(targets)

    quantiles = [0.10, 0.50, 0.90]
    model_paths = {}

    for alpha in quantiles:
        tag = f"p{int(alpha * 100)}"
        model_file = artifacts_dir / f"{tag}.txt"

        train_data = lgb.Dataset(x, label=y)
        params = {
            "objective": "quantile",
            "alpha": alpha,
            "metric": "quantile",
            "num_leaves": 31,
            "learning_rate": 0.05,
            "min_data_in_leaf": 20,
            "verbosity": -1,
            "seed": 42,
        }

        booster = lgb.train(
            params,
            train_data,
            num_boost_round=120,
        )

        booster.save_model(str(model_file))
        model_paths[tag] = str(model_file)
        print(f"Trained & exported {tag} booster model ({alpha=}) -> {model_file}")

    return model_paths


if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parent.parent
    csv_file = base_dir / "data" / "ecor_cascade_training_data.csv"
    art_dir = base_dir / "ml" / "artifacts"
    train_quantile_models(csv_file, art_dir)
