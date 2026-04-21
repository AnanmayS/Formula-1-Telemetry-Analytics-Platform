from __future__ import annotations

import argparse
import json
from pathlib import Path

import _bootstrap  # noqa: F401

from app.services.fastf1_service import FastF1Service


def main() -> None:
    parser = argparse.ArgumentParser(description="List real FastF1 events for one or more seasons.")
    parser.add_argument("--seasons", nargs="+", type=int, default=[2024])
    parser.add_argument("--output", type=Path, default=Path("data/processed/events.json"))
    args = parser.parse_args()

    service = FastF1Service()
    payload = {str(season): service.get_events(season) for season in args.seasons}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote event schedule for {len(args.seasons)} seasons to {args.output}")


if __name__ == "__main__":
    main()

