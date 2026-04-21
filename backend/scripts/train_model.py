from __future__ import annotations

import argparse
import json

import _bootstrap  # noqa: F401

from app.services.model_service import ModelService


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the XGBoost final-position model.")
    parser.add_argument(
        "--seasons",
        nargs="*",
        type=int,
        default=None,
        help="Optional seasons to train on. Omit this to use the latest three processed race seasons.",
    )
    parser.add_argument("--test-season", type=int, default=None)
    parser.add_argument("--min-sessions", type=int, default=3)
    args = parser.parse_args()

    result = ModelService().train(args.seasons, args.test_season, args.min_sessions)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
