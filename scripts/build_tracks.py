"""
build_tracks.py

Converts raw TUMFTM racetrack-database centerline CSVs (data/raw/tracks/*.csv)
into clean per-track JSON files (data/tracks/*.json) that the app consumes
directly at runtime -- no Python/pandas needed in the app itself.

For each track this computes, from raw (x, y) points alone:
  - cumulative distance along the track (m)
  - local curvature / radius of curvature (via three-point circumradius,
    "Menger curvature", over a smoothing window to reduce GPS noise)
  - turn direction (left/right) from the sign of the curvature
  - automatic corner detection: contiguous low-radius regions become
    numbered corners, in direction of travel, with an apex point

Manual, source-cited overrides (banking angle, elevation deltas for
corners where that data isn't derivable from a flat x/y centerline) are
merged in from data/overrides/*.json by track id + corner number.

Source data: TUMFTM/racetrack-database (MIT), centerlines derived from
OpenStreetMap GPS traces, widths from satellite imagery. Corner radius
values here are ESTIMATES from that centerline, not official FIA figures --
good enough for a physics-based cornering-speed model, not for engineering
tolerances.
"""

import csv
import json
import math
import os

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "tracks")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "tracks")
OVERRIDES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "overrides", "banking.json")

# id -> (Display name, country)
TRACK_META = {
    "Austin": ("Circuit of the Americas", "United States"),
    "Budapest": ("Hungaroring", "Hungary"),
    "Catalunya": ("Circuit de Barcelona-Catalunya", "Spain"),
    "Hockenheim": ("Hockenheimring", "Germany"),
    "Melbourne": ("Albert Park Circuit", "Australia"),
    "MexicoCity": ("Autodromo Hermanos Rodriguez", "Mexico"),
    "Montreal": ("Circuit Gilles Villeneuve", "Canada"),
    "Monza": ("Autodromo Nazionale Monza", "Italy"),
    "Nuerburgring": ("Nurburgring", "Germany"),
    "Sakhir": ("Bahrain International Circuit", "Bahrain"),
    "SaoPaulo": ("Autodromo Jose Carlos Pace (Interlagos)", "Brazil"),
    "Sepang": ("Sepang International Circuit", "Malaysia"),
    "Shanghai": ("Shanghai International Circuit", "China"),
    "Silverstone": ("Silverstone Circuit", "United Kingdom"),
    "Sochi": ("Sochi Autodrom", "Russia"),
    "Spa": ("Circuit de Spa-Francorchamps", "Belgium"),
    "Spielberg": ("Red Bull Ring", "Austria"),
    "Suzuka": ("Suzuka International Racing Course", "Japan"),
    "YasMarina": ("Yas Marina Circuit", "United Arab Emirates"),
    "Zandvoort": ("Circuit Zandvoort", "Netherlands"),
}

# Smoothing window (points on each side) used for curvature estimation.
CURVATURE_WINDOW = 4
# Radius (m) below which a point is considered "in a corner" rather than a straight/kink.
CORNER_RADIUS_THRESHOLD = 220.0
# Minimum distance (m) between separate corners; closer minima are merged.
MIN_CORNER_SEPARATION = 60.0


def read_track_csv(path):
    points = []
    with open(path, newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row or row[0].startswith("#"):
                continue
            x, y, wr, wl = (float(v) for v in row)
            points.append({"x": x, "y": y, "wRight": wr, "wLeft": wl})
    return points


def cumulative_distance(points, closed=True):
    n = len(points)
    dist = [0.0] * n
    for i in range(1, n):
        dx = points[i]["x"] - points[i - 1]["x"]
        dy = points[i]["y"] - points[i - 1]["y"]
        dist[i] = dist[i - 1] + math.hypot(dx, dy)
    total = dist[-1]
    if closed:
        dx = points[0]["x"] - points[-1]["x"]
        dy = points[0]["y"] - points[-1]["y"]
        total += math.hypot(dx, dy)
    return dist, total


def menger_curvature(a, b, c):
    """Signed curvature (1/m) of the circle through points a, b, c.
    Positive = left turn, negative = right turn, in a standard x-right/y-up plane."""
    ax, ay = a["x"], a["y"]
    bx, by = b["x"], b["y"]
    cx, cy = c["x"], c["y"]
    area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)  # 2x signed triangle area
    ab = math.hypot(bx - ax, by - ay)
    bc = math.hypot(cx - bx, cy - by)
    ca = math.hypot(ax - cx, ay - cy)
    denom = ab * bc * ca
    if denom < 1e-9:
        return 0.0
    return 2.0 * area2 / denom


def compute_curvature(points, window=CURVATURE_WINDOW):
    n = len(points)
    curv = [0.0] * n
    for i in range(n):
        a = points[(i - window) % n]
        b = points[i]
        c = points[(i + window) % n]
        curv[i] = menger_curvature(a, b, c)
    return curv


def detect_corners(points, dist, curv, total_length):
    n = len(points)
    radius = [1e6 if abs(k) < 1e-6 else 1.0 / abs(k) for k in curv]

    in_corner = [r < CORNER_RADIUS_THRESHOLD for r in radius]

    # Find contiguous runs of "in corner" over the closed loop.
    runs = []
    i = 0
    visited = [False] * n
    # Rotate start to a point NOT in a corner, if possible, so we don't split a run at index 0.
    start_offset = 0
    for i in range(n):
        if not in_corner[i]:
            start_offset = i
            break

    idx = start_offset
    count = 0
    while count < n:
        if in_corner[idx] and not visited[idx]:
            run = []
            j = idx
            steps = 0
            while in_corner[j % n] and steps < n:
                run.append(j % n)
                visited[j % n] = True
                j += 1
                steps += 1
            runs.append(run)
            idx = j
            count += steps
        else:
            visited[idx % n] = True
            idx += 1
            count += 1

    corners = []
    for run in runs:
        # apex = point of minimum radius within the run
        apex_i = min(run, key=lambda k: radius[k])
        corners.append({
            "apexIndex": apex_i,
            "apexDistance": dist[apex_i],
            "x": points[apex_i]["x"],
            "y": points[apex_i]["y"],
            "radius_m": round(radius[apex_i], 1),
            "direction": "left" if curv[apex_i] > 0 else "right",
            "entryIndex": run[0],
            "exitIndex": run[-1],
            "entryDistance": dist[run[0]],
            "exitDistance": dist[run[-1]],
        })

    # Merge corners whose apexes are closer than MIN_CORNER_SEPARATION (measured along track,
    # accounting for wraparound), keeping the tighter (smaller radius) one.
    corners.sort(key=lambda c: c["apexDistance"])
    merged = []
    for c in corners:
        if merged:
            prev = merged[-1]
            gap = c["apexDistance"] - prev["apexDistance"]
            gap = min(gap, total_length - gap)
            if gap < MIN_CORNER_SEPARATION:
                if c["radius_m"] < prev["radius_m"]:
                    merged[-1] = c
                continue
        merged.append(c)

    # Also check wraparound merge between last and first.
    if len(merged) > 1:
        gap = (total_length - merged[-1]["apexDistance"]) + merged[0]["apexDistance"]
        if gap < MIN_CORNER_SEPARATION:
            if merged[-1]["radius_m"] < merged[0]["radius_m"]:
                merged[0] = merged.pop()
            else:
                merged.pop()

    merged.sort(key=lambda c: c["apexDistance"])
    for n_, c in enumerate(merged, start=1):
        c["number"] = n_

    return merged, radius


def load_overrides():
    if not os.path.exists(OVERRIDES_PATH):
        return {}
    with open(OVERRIDES_PATH) as f:
        return json.load(f)


def build_track(track_id, csv_path, overrides):
    points = read_track_csv(csv_path)
    dist, total_length = cumulative_distance(points, closed=True)
    curv = compute_curvature(points)
    corners, radius = detect_corners(points, dist, curv, total_length)

    track_overrides = overrides.get(track_id, {})

    for c in corners:
        o = track_overrides.get(str(c["number"]), {})
        c["name"] = o.get("name")
        c["bankingDeg"] = o.get("bankingDeg", 0)
        c["elevationChange_m"] = o.get("elevationChange_m", 0)
        c["note"] = o.get("note")

    centerline = []
    for i, p in enumerate(points):
        centerline.append({
            "x": round(p["x"], 3),
            "y": round(p["y"], 3),
            "dist": round(dist[i], 3),
            "wLeft": round(p["wLeft"], 3),
            "wRight": round(p["wRight"], 3),
            "radius_m": round(min(radius[i], 9999), 1),
        })

    display_name, country = TRACK_META.get(track_id, (track_id, "Unknown"))

    return {
        "id": track_id.lower(),
        "name": display_name,
        "country": country,
        "length_m": round(total_length, 1),
        "cornerCount": len(corners),
        "source": "TUMFTM/racetrack-database (OSM-derived centerline + satellite widths); "
                  "corner radius/apex auto-detected via curvature analysis; "
                  "banking/elevation overrides manually sourced (see data/overrides/banking.json)",
        "centerline": centerline,
        "corners": corners,
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    overrides = load_overrides()
    index = []

    for fname in sorted(os.listdir(RAW_DIR)):
        if not fname.endswith(".csv"):
            continue
        track_id = fname[:-4]
        csv_path = os.path.join(RAW_DIR, fname)
        track = build_track(track_id, csv_path, overrides)

        out_path = os.path.join(OUT_DIR, f"{track['id']}.json")
        with open(out_path, "w") as f:
            json.dump(track, f, indent=2)

        index.append({
            "id": track["id"],
            "name": track["name"],
            "country": track["country"],
            "length_m": track["length_m"],
            "cornerCount": track["cornerCount"],
        })
        print(f"{track['id']:15s} {track['name']:45s} {track['length_m']:8.0f} m  "
              f"{track['cornerCount']:2d} corners")

    with open(os.path.join(OUT_DIR, "index.json"), "w") as f:
        json.dump(index, f, indent=2)

    print(f"\nWrote {len(index)} tracks + index.json to {OUT_DIR}")


if __name__ == "__main__":
    main()
