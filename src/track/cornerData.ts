/**
 * Typed access to the two Spa corner selection files + per-corner presentation
 * metadata (apex distance, elevation profile, sensible default params).
 *
 * This is the SHARED CONTRACT between the 3D scene, the car, and the UI.
 * Everything here is pure data / pure math -- no Three.js, no React.
 *
 * Coordinate convention (data space): the JSON centerline is 2D, metres,
 * x/y in the track plane, re-based so the first point is (0,0). Elevation is
 * NOT in the JSON -- it comes from `elevationAt(dist)` below.
 *
 * The 3D layer maps data -> world as:  world.x = x,  world.y = elevation (up),  world.z = -y
 * so that a right-handed Three.js scene looks "down" onto the same plan view.
 */

import laSourceJson from "../../data/spa/la-source.json";
import eauRougeJson from "../../data/spa/eau-rouge-raidillon.json";
import type { CorneringParams } from "../../physics/types";

export type CornerId = "la-source" | "eau-rouge-raidillon";

export interface CenterlinePoint {
  x: number;
  y: number;
  /** Arc-length distance along the segment from its start, metres. Monotonic. */
  distFromSegmentStart: number;
  /** Half-width to the LEFT of the centerline (in direction of travel), metres. */
  wLeft: number;
  /** Half-width to the RIGHT of the centerline, metres. */
  wRight: number;
  /** Local curvature radius, metres. 9999 = straight. */
  radius_m: number;
}

export interface ApexMarker {
  name: string;
  dist_m: number;
  radius_m: number;
  direction: "left" | "right";
}

export interface CornerData {
  id: CornerId;
  displayName: string;
  shortName: string;
  description: string;
  type: string;
  primaryApex: {
    radius_m: number;
    direction: "left" | "right";
    bankingDeg: number;
    elevationChange_m: number;
  };
  realWorldApexSpeed_kmh: number;
  centerline: CenterlinePoint[];
  /** Distance along the segment of the primary apex (where the car sits). */
  apexDist_m: number;
  /** All named apexes in this segment (1 for La Source, 3 for Eau Rouge complex). */
  apexMarkers: ApexMarker[];
  /** Elevation (metres, up) at a given distance along the segment. */
  elevationAt: (dist_m: number) => number;
  /** Banking (degrees, positive = track surface tilts toward the inside of the turn) at a distance. */
  bankingAt: (dist_m: number) => number;
  /**
   * Corner-specific defaults for the driver-input params. Tuned so each corner
   * opens ON the limit with a small margin, so any slider nudge visibly tips it.
   * (Probe: La Source limit ~65 km/h; bp 92 -> 62 km/h. Eau Rouge wing 0.9 limit
   * ~288 km/h; bp 10 from 85 m/s -> 282 km/h.)
   */
  defaultParams: Pick<CorneringParams, "approachSpeed_ms" | "brakingPointBeforeApex_m"> &
    Partial<Pick<CorneringParams, "frontWing" | "rearWing">>;
  /** Slider range for braking point, metres. */
  brakingRange: { min: number; max: number };
  /** Camera hint: a good default orbit target + position, in WORLD space (x, y=up, z). */
  cameraHint: { target: [number, number, number]; position: [number, number, number] };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Eau Rouge / Raidillon elevation, metres. Segment runs 0 -> ~525 m.
 * Real profile: gentle downhill run from La Source into the compression at the
 * bottom of Eau Rouge (~dist 130-150), then a steep (~17%) climb through
 * Raidillon to the crest (~dist 400), then flat onto the Kemmel straight.
 * Net gain ~ +30 m across the complex, per primaryApex.elevationChange_m.
 */
function eauRougeElevation(d: number): number {
  const dip = -4 * smoothstep(0, 130, d); // slight descent into the compression
  const climb = 34 * smoothstep(140, 400, d); // the famous climb, crests ~400 m
  return dip + climb;
}

const laSource = laSourceJson as unknown as {
  displayName: string;
  description: string;
  type: string;
  primaryApex: CornerData["primaryApex"];
  realWorldReference: { typicalApexSpeed_kmh: number };
  centerline: CenterlinePoint[];
  corners: Array<{ distFromSegmentStart: number; radius_m: number; direction: "left" | "right" }>;
};

const eauRouge = eauRougeJson as unknown as {
  displayName: string;
  description: string;
  type: string;
  primaryApex: CornerData["primaryApex"];
  realWorldReference: { typicalApexSpeed_kmh: number };
  centerline: CenterlinePoint[];
  subApexes: Array<{
    name: string;
    distFromSegmentStart: number;
    radius_m: number;
    direction: "left" | "right";
  }>;
};

export const CORNERS: Record<CornerId, CornerData> = {
  "la-source": {
    id: "la-source",
    displayName: laSource.displayName,
    shortName: "La Source",
    description: laSource.description,
    type: laSource.type,
    primaryApex: laSource.primaryApex,
    realWorldApexSpeed_kmh: laSource.realWorldReference.typicalApexSpeed_kmh,
    centerline: laSource.centerline,
    apexDist_m: laSource.corners[0].distFromSegmentStart, // 150
    apexMarkers: [
      {
        name: "La Source apex",
        dist_m: laSource.corners[0].distFromSegmentStart,
        radius_m: laSource.corners[0].radius_m,
        direction: laSource.corners[0].direction,
      },
    ],
    elevationAt: () => 0,
    bankingAt: () => laSource.primaryApex.bankingDeg,
    defaultParams: { approachSpeed_ms: 85, brakingPointBeforeApex_m: 93, frontWing: 0.6, rearWing: 0.6 },
    brakingRange: { min: 40, max: 160 },
    cameraHint: { target: [-45, 0, -110], position: [25, 55, -45] },
  },
  "eau-rouge-raidillon": {
    id: "eau-rouge-raidillon",
    displayName: eauRouge.displayName,
    shortName: "Eau Rouge / Raidillon",
    description: eauRouge.description,
    type: eauRouge.type,
    primaryApex: eauRouge.primaryApex,
    realWorldApexSpeed_kmh: eauRouge.realWorldReference.typicalApexSpeed_kmh,
    centerline: eauRouge.centerline,
    apexDist_m: eauRouge.subApexes[0].distFromSegmentStart, // 150 = Eau Rouge left-hander
    apexMarkers: eauRouge.subApexes.map((s) => ({
      name: s.name,
      dist_m: s.distFromSegmentStart,
      radius_m: s.radius_m,
      direction: s.direction,
    })),
    elevationAt: eauRougeElevation,
    bankingAt: () => eauRouge.primaryApex.bankingDeg,
    defaultParams: { approachSpeed_ms: 85, brakingPointBeforeApex_m: 10, frontWing: 0.9, rearWing: 0.9 },
    brakingRange: { min: 0, max: 80 },
    cameraHint: { target: [165, 15, 192], position: [-100, 20, 120] },
  },
};

export const CORNER_IDS: CornerId[] = ["la-source", "eau-rouge-raidillon"];

// ---------------------------------------------------------------------------
// Pure 2D centerline helpers (data space). The 3D layer wraps these.
// ---------------------------------------------------------------------------

/** Find the index i such that centerline[i].dist <= d < centerline[i+1].dist (clamped). */
export function segmentIndexAt(centerline: CenterlinePoint[], dist_m: number): number {
  const n = centerline.length;
  if (dist_m <= centerline[0].distFromSegmentStart) return 0;
  if (dist_m >= centerline[n - 1].distFromSegmentStart) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (centerline[mid].distFromSegmentStart <= dist_m) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface Centerline2DSample {
  x: number;
  y: number;
  /** Unit tangent (direction of travel) in data space. */
  tx: number;
  ty: number;
  wLeft: number;
  wRight: number;
  radius_m: number;
  dist_m: number;
}

/** Linearly interpolate the 2D centerline at an arc-length distance. */
export function sampleCenterline2D(
  centerline: CenterlinePoint[],
  dist_m: number
): Centerline2DSample {
  const n = centerline.length;
  const d = Math.min(
    centerline[n - 1].distFromSegmentStart,
    Math.max(centerline[0].distFromSegmentStart, dist_m)
  );
  const i = segmentIndexAt(centerline, d);
  const a = centerline[i];
  const b = centerline[i + 1];
  const span = b.distFromSegmentStart - a.distFromSegmentStart || 1;
  const t = (d - a.distFromSegmentStart) / span;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: a.x + dx * t,
    y: a.y + dy * t,
    tx: dx / len,
    ty: dy / len,
    wLeft: a.wLeft + (b.wLeft - a.wLeft) * t,
    wRight: a.wRight + (b.wRight - a.wRight) * t,
    radius_m: a.radius_m + (b.radius_m - a.radius_m) * t,
    dist_m: d,
  };
}

/** Heading of travel at a distance, degrees, 0 = +x axis (matches CorneringParams.carHeadingDeg). */
export function headingDegAt(centerline: CenterlinePoint[], dist_m: number): number {
  const s = sampleCenterline2D(centerline, dist_m);
  return (Math.atan2(s.ty, s.tx) * 180) / Math.PI;
}

export function segmentStart(c: CornerData): number {
  return c.centerline[0].distFromSegmentStart;
}
export function segmentEnd(c: CornerData): number {
  return c.centerline[c.centerline.length - 1].distFromSegmentStart;
}
