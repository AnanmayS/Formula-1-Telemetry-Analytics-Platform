from __future__ import annotations

import json

import _bootstrap  # noqa: F401

from app.services.model_service import ModelService


def main() -> None:
    print(json.dumps(ModelService().metrics(), indent=2))
    print("\nTop feature importance:")
    print(json.dumps(ModelService().feature_importance()[:15], indent=2))


if __name__ == "__main__":
    main()

