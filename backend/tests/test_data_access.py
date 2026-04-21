from __future__ import annotations

import math

import pandas as pd

from app.services.data_access import ProcessedDataService


def test_reference_track_prefers_sparse_single_lap_over_full_driver_trace() -> None:
    rows: list[dict[str, float | int | str]] = []
    replay_time = 0.0
    for lap in range(1, 4):
        for sample in range(10):
            angle = (sample / 10) * math.tau
            rows.append(
                {
                    "Driver": "AAA",
                    "LapNumber": lap,
                    "ReplayTime": replay_time,
                    "X": math.cos(angle) * 10,
                    "Y": math.sin(angle) * 10,
                }
            )
            replay_time += 1.0

    service = ProcessedDataService()
    track = service._build_reference_track(pd.DataFrame(rows))

    assert len(track) == 520
    assert service._track_length(track) < 100


def test_reference_track_prefers_telemetry_over_sparse_replay() -> None:
    telemetry = pd.DataFrame(
        [
            {
                "Driver": "AAA",
                "ReplayTime": sample,
                "Distance": sample,
                "X": math.cos((sample / 12) * math.tau) * 10,
                "Y": math.sin((sample / 12) * math.tau) * 10,
            }
            for sample in range(12)
        ]
    )
    replay = pd.DataFrame(
        [
            {"Driver": "AAA", "LapNumber": lap, "ReplayTime": lap * 100 + sample, "X": sample * 100, "Y": lap * 100}
            for lap in range(1, 4)
            for sample in range(12)
        ]
    )

    service = ProcessedDataService()
    track = service._build_reference_track(replay, telemetry)

    assert len(track) == 520
    assert service._track_length(track) < 100


def test_qualifying_lookup_derives_stage_times_from_laps() -> None:
    rows = []
    for driver, q1, q2, q3 in [
        ("AAA", 72.0, 71.0, 70.0),
        ("BBB", 72.5, 71.5, None),
        ("CCC", 73.0, None, None),
    ]:
        rows.append({"Driver": driver, "Time": 1000.0, "LapTime": q1, "Position": None})
        if q2 is not None:
            rows.append({"Driver": driver, "Time": 1600.0, "LapTime": q2, "Position": None})
        if q3 is not None:
            rows.append({"Driver": driver, "Time": 2300.0, "LapTime": q3, "Position": None})

    service = ProcessedDataService()
    lookup = service._qualifying_lookup_from_laps(pd.DataFrame(rows))

    assert lookup["AAA"]["qualifying_stage"] == "Q3"
    assert lookup["AAA"]["q3_time_seconds"] == 70.0
    assert lookup["BBB"]["qualifying_stage"] == "Q2"
    assert lookup["BBB"]["q2_time_seconds"] == 71.5
    assert lookup["CCC"]["qualifying_stage"] == "Q1"
    assert lookup["CCC"]["q1_time_seconds"] == 73.0
    assert lookup["AAA"]["position"] == 1
