from __future__ import annotations

from xgboost import XGBRegressor

from app.services.model_service import _ensure_xgboost_sklearn_tags


def test_xgboost_sklearn_tags_compatibility_patch(monkeypatch) -> None:
    def broken_tags(self: XGBRegressor):  # type: ignore[no-untyped-def]
        raise AttributeError("'super' object has no attribute '__sklearn_tags__'")

    monkeypatch.setattr(XGBRegressor, "__sklearn_tags__", broken_tags, raising=False)

    _ensure_xgboost_sklearn_tags()

    tags = XGBRegressor().__sklearn_tags__()
    assert tags.estimator_type == "regressor"
    assert tags.target_tags.required is True
