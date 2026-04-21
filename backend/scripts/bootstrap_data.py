from __future__ import annotations

import argparse
import json

import _bootstrap  # noqa: F401

from app.services.bootstrap import DataBootstrapService


def main() -> None:
    parser = argparse.ArgumentParser(description="Cache the last few completed F1 race seasons with FastF1.")
    parser.add_argument("--force", action="store_true", help="Rebuild processed artifacts even when they already exist.")
    args = parser.parse_args()

    result = DataBootstrapService().bootstrap_recent_races(force=args.force)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
