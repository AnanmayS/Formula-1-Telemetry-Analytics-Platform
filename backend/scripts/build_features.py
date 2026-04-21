from __future__ import annotations

import argparse
from pathlib import Path

import _bootstrap  # noqa: F401

from app.services.feature_engineering import FeatureBuilder


def main() -> None:
    parser = argparse.ArgumentParser(description="Build driver-race feature rows from processed race artifacts.")
    parser.add_argument("--seasons", nargs="*", type=int, default=None)
    parser.add_argument("--output", type=Path, default=Path("data/models/training_features.csv"))
    args = parser.parse_args()

    result = FeatureBuilder().build_from_processed(seasons=args.seasons)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.frame.to_csv(args.output, index=False)
    print(f"Wrote {len(result.frame)} rows from {result.source_sessions} race sessions to {args.output}")


if __name__ == "__main__":
    main()

