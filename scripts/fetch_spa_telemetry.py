"""
fetch_spa_telemetry.py

Pulls one real F1 qualifying lap's telemetry at Spa via FastF1 and extracts
approximate real-world corner speeds for La Source and Eau Rouge/Raidillon,
to use as calibration/validation targets for the physics model constants
in physics/constants.ts.

This does NOT try to precisely register FastF1's per-lap distance axis
against the TUMFTM centerline's distance axis (different sources, different
start references) -- instead it finds corners by their well-known
qualitative signature in the speed trace:
  - La Source: the first, deepest speed minimum after the lap start
    (a near-standstill 2nd gear hairpin).
  - Eau Rouge entry: the next distinct (shallower, high-speed) local
    dip further down the lap, before the long Kemmel straight.

Output: data/telemetry/spa_calibration.json
"""

import json
import os

import fastf1
import numpy as np

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "telemetry", ".fastf1cache")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "telemetry", "spa_calibration.json")

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)


def find_local_minima(distance, speed, search_start, search_end, window=15):
    mask = (distance >= search_start) & (distance <= search_end)
    idx = np.where(mask)[0]
    if len(idx) == 0:
        return None
    sub_speed = speed[idx]
    min_local_idx = idx[np.argmin(sub_speed)]
    return {
        "distance_m": float(distance[min_local_idx]),
        "speed_kmh": float(speed[min_local_idx]),
    }


def main():
    year, gp, session_code = 2023, "Belgium", "Q"
    session = fastf1.get_session(year, gp, session_code)
    session.load(telemetry=True, laps=True, weather=False)

    fastest = session.laps.pick_fastest()
    tel = fastest.get_car_data().add_distance()

    distance = tel["Distance"].to_numpy()
    speed = tel["Speed"].to_numpy()  # km/h

    la_source = find_local_minima(distance, speed, 0, 550)
    eau_rouge = find_local_minima(distance, speed, 550, 1100)

    result = {
        "source": "FastF1",
        "session": f"{year} {gp} Grand Prix -- Qualifying",
        "driver": fastest["Driver"],
        "lapTime": str(fastest["LapTime"]),
        "note": "Corners identified by speed-trace signature (deepest early minimum "
                "= La Source, next high-speed dip = Eau Rouge entry), not by precise "
                "distance registration against the TUMFTM centerline -- treat as an "
                "order-of-magnitude calibration reference, not ground truth telemetry "
                "for a specific named corner.",
        "laSource": la_source,
        "eauRougeEntry": eau_rouge,
    }

    with open(OUT_PATH, "w") as f:
        json.dump(result, f, indent=2)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
