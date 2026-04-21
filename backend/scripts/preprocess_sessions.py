from __future__ import annotations

import argparse

import _bootstrap  # noqa: F401

from app.core.logging import configure_logging
from app.services.preprocessing import ingest_bulk


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch and preprocess FastF1 sessions into local artifacts.")
    parser.add_argument("--seasons", nargs="+", type=int, default=[2024])
    parser.add_argument("--session", default="R")
    parser.add_argument("--events", nargs="*", default=None, help="Optional event names, for example Monaco Canadian")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    configure_logging()
    results = ingest_bulk(args.seasons, args.session, args.events, args.force, args.workers)
    for item in results:
        print(f"{item['season']} {item['event']} {item['session']}: {item['status']} - {item.get('message')}")


if __name__ == "__main__":
    main()

