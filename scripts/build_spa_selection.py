"""
build_spa_selection.py

Hackathon-scope narrowing: instead of the full 20-track / any-corner picker,
the demo focuses on ONE track (Spa-Francorchamps) and TWO hand-picked,
maximally-contrasting corners:

  - La Source        (corner #1: tight hairpin, ~17m radius, ~80 km/h)
  - Eau Rouge/Raidillon (corners #2-4: fast uphill left-right-left complex,
                          ~96-107m radius, ~300 km/h)

Pulls the relevant centerline window for each from the already-built
data/tracks/spa.json (see build_tracks.py) and re-bases distance/position
to a local origin at the corner's entry point, so the 3D scene for each
corner can be built as a self-contained "diorama" without needing the
whole 7km circuit in memory.

Output: data/spa/la-source.json, data/spa/eau-rouge-raidillon.json
"""

import json
import math
import os

TRACKS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "tracks")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "spa")

# How far before/after the selected corner(s) to include in the centerline window (meters).
MARGIN_BEFORE_M = 150
MARGIN_AFTER_M = 150


def load_spa():
    with open(os.path.join(TRACKS_DIR, "spa.json")) as f:
        return json.load(f)


def window_by_distance(centerline, total_length, dist_start, dist_end):
    """Extract centerline points with dist in [dist_start, dist_end], handling wraparound."""
    out = []
    if dist_start <= dist_end:
        for p in centerline:
            if dist_start <= p["dist"] <= dist_end:
                out.append(p)
    else:
        for p in centerline:
            if p["dist"] >= dist_start or p["dist"] <= dist_end:
                out.append(p)
    return out


def rebased_segment(centerline, total_length, corners, ref_apex_dist, dist_start, dist_end):
    pts = window_by_distance(centerline, total_length, dist_start, dist_end)
    if not pts:
        raise ValueError("Empty centerline window -- check distance range")

    origin = pts[0]
    ox, oy = origin["x"], origin["y"]

    segment = []
    for p in pts:
        rel_dist = p["dist"] - dist_start
        if rel_dist < 0:
            rel_dist += total_length
        segment.append({
            "x": round(p["x"] - ox, 3),
            "y": round(p["y"] - oy, 3),
            "distFromSegmentStart": round(rel_dist, 3),
            "wLeft": p["wLeft"],
            "wRight": p["wRight"],
            "radius_m": p["radius_m"],
        })

    rebased_corners = []
    for c in corners:
        rel_dist = c["apexDistance"] - dist_start
        if rel_dist < 0:
            rel_dist += total_length
        rebased_corners.append({
            **c,
            "x": round(c["x"] - ox, 3),
            "y": round(c["y"] - oy, 3),
            "distFromSegmentStart": round(rel_dist, 3),
        })

    return segment, rebased_corners


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    spa = load_spa()
    centerline = spa["centerline"]
    total_length = spa["length_m"]
    corners_by_num = {c["number"]: c for c in spa["corners"]}

    # --- La Source: corner #1 ---
    la_source = corners_by_num[1]
    ls_start = (la_source["apexDistance"] - MARGIN_BEFORE_M) % total_length
    ls_end = (la_source["apexDistance"] + MARGIN_AFTER_M) % total_length
    ls_segment, ls_corners = rebased_segment(
        centerline, total_length, [la_source], la_source["apexDistance"], ls_start, ls_end
    )

    la_source_out = {
        "id": "la-source",
        "displayName": "La Source (Turn 1)",
        "track": "Circuit de Spa-Francorchamps",
        "type": "hairpin",
        "description": "The tightest corner on the F1 calendar: a near-180-degree "
                        "second-gear hairpin immediately after the start/finish straight.",
        "primaryApex": {
            "radius_m": la_source["radius_m"],
            "direction": la_source["direction"],
            "bankingDeg": la_source["bankingDeg"],
            "elevationChange_m": la_source["elevationChange_m"],
        },
        "segmentLength_m": MARGIN_BEFORE_M + MARGIN_AFTER_M,
        "centerline": ls_segment,
        "corners": ls_corners,
        "realWorldReference": {
            "typicalApexSpeed_kmh": 80,
            "note": "Approximate, publicly reported broadcast/analysis figures -- not official telemetry."
        },
    }

    # --- Eau Rouge / Raidillon: corners #2, #3, #4 combined ---
    er_first = corners_by_num[2]
    er_last = corners_by_num[4]
    er_start = (er_first["apexDistance"] - MARGIN_BEFORE_M) % total_length
    er_end = (er_last["apexDistance"] + MARGIN_AFTER_M) % total_length
    er_segment, er_corners = rebased_segment(
        centerline, total_length, [corners_by_num[2], corners_by_num[3], corners_by_num[4]],
        er_first["apexDistance"], er_start, er_end
    )

    # Representative single radius for the physics model: the tightest of the three
    # sub-apexes, since that's the limiting factor for max speed through the complex
    # (all three are similar radius -- this is a fast, continuous S, not one hairpin
    # followed by easy kinks).
    representative_radius = min(c["radius_m"] for c in [er_first, corners_by_num[3], er_last])

    eau_rouge_out = {
        "id": "eau-rouge-raidillon",
        "displayName": "Eau Rouge / Raidillon (Turns 3-6)",
        "track": "Circuit de Spa-Francorchamps",
        "type": "high-speed-complex",
        "description": "The most famous corner complex in motorsport: a fast left-right-left "
                        "taken almost flat-out, with a ~30m uphill elevation change "
                        "(~17% gradient at its steepest) through the climb from Eau Rouge "
                        "into Raidillon.",
        "primaryApex": {
            "radius_m": round(representative_radius, 1),
            "direction": "left",
            "bankingDeg": 0,
            "elevationChange_m": 30,
            "note": "Representative radius uses the tightest of the three sub-apexes "
                    "(Eau Rouge/Raidillon/exit are all similar radius, ~96-107m); "
                    "elevation is a whole-complex figure, not physics-active in the MVP "
                    "model -- see docs/PHYSICS_MODEL.md for the stretch-goal slope term.",
        },
        "subApexes": er_corners,
        "segmentLength_m": MARGIN_BEFORE_M + MARGIN_AFTER_M,
        "centerline": er_segment,
        "realWorldReference": {
            "typicalApexSpeed_kmh": 300,
            "note": "Approximate, publicly reported broadcast/analysis figures -- not official telemetry."
        },
    }

    with open(os.path.join(OUT_DIR, "la-source.json"), "w") as f:
        json.dump(la_source_out, f, indent=2)
    with open(os.path.join(OUT_DIR, "eau-rouge-raidillon.json"), "w") as f:
        json.dump(eau_rouge_out, f, indent=2)

    print("Wrote data/spa/la-source.json "
          f"({len(ls_segment)} centerline points, apex radius {la_source['radius_m']}m)")
    print("Wrote data/spa/eau-rouge-raidillon.json "
          f"({len(er_segment)} centerline points, representative radius {representative_radius:.1f}m)")


if __name__ == "__main__":
    main()
