from app.services.feature_engineering import bucket_position_delta, position_delta


def test_bucket_position_delta_gain_flat_loss() -> None:
    assert bucket_position_delta(10, 7) == 1
    assert bucket_position_delta(4, 4) == 0
    assert bucket_position_delta(3, 8) == -1


def test_bucket_position_delta_ignores_invalid_grid_values() -> None:
    assert bucket_position_delta(0, 8) is None
    assert bucket_position_delta(None, 8) is None


def test_position_delta_is_grid_minus_finish() -> None:
    assert position_delta(12, 9) == 3
    assert position_delta(2, 6) == -4

