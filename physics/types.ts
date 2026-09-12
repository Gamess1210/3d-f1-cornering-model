/** Shared types for the physics module. Kept dependency-free (no Three.js, no React). */

export interface TrackCenterlinePoint {
  x: number;
  y: number;
  dist: number;
  wLeft: number;
  wRight: number;
  radius_m: number;
}

export interface TrackCorner {
  number: number;
  apexIndex: number;
  apexDistance: number;
  x: number;
  y: number;
  radius_m: number;
  direction: "left" | "right";
  entryIndex: number;
  exitIndex: number;
  entryDistance: number;
  exitDistance: number;
  name: string | null;
  bankingDeg: number;
  elevationChange_m: number;
  note: string | null;
}

/**
 * Minimal shape the cornering solver actually needs. The full TrackCorner
 * (from the multi-track pipeline) satisfies this, and so does a corner's
 * `primaryApex` from the focused data/spa/*.json selection files -- the
 * solver doesn't care which source it came from.
 */
export interface CornerPhysicsInput {
  radius_m: number;
  bankingDeg: number;
}

export interface TrackData {
  id: string;
  name: string;
  country: string;
  length_m: number;
  cornerCount: number;
  source: string;
  centerline: TrackCenterlinePoint[];
  corners: TrackCorner[];
}

/** 0..1 slider position for a wing element (0 = fully closed/min downforce, 1 = max downforce). */
export type WingSetting = number;

export interface WindState {
  /** Wind speed in m/s, measured at track level. */
  speed_ms: number;
  /** Compass-style bearing (degrees, 0 = blowing from north) the wind is COMING FROM. */
  headingDeg: number;
}

export interface CorneringParams {
  frontWing: WingSetting;
  rearWing: WingSetting;
  /** 0 (fresh) to 100 (fully degraded) tire wear. */
  tireWearPct: number;
  tireTempState: "cold" | "optimal" | "overheated";
  wind: WindState;
  /** Car's heading through the corner apex, degrees, 0 = +x axis, matches track x/y plane. */
  carHeadingDeg: number;
  /** Distance (m) before the geometric apex where the driver begins braking. */
  brakingPointBeforeApex_m: number;
  /** Speed (m/s) at the start of the braking zone / corner approach. */
  approachSpeed_ms: number;
  /**
   * Racing line adjustment: multiplies the effective corner radius.
   * 1.0 = the raw centerline radius. >1.0 = wider/straighter (later apex,
   * using full track width). <1.0 = tighter early-apex line.
   */
  lineRadiusMultiplier: number;
}

export interface CorneringResult {
  /** Max speed (m/s) the car can sustain through the apex without exceeding the friction ellipse. */
  apexSpeed_ms: number;
  /** Speed (m/s) actually achieved at the apex given the chosen braking point + approach speed. */
  achievedApexSpeed_ms: number;
  /** Whether the achieved speed is <= the physically possible apex speed (true = car stays on track). */
  isOnLimit: boolean;
  /** Positive = understeer risk (trying to carry more speed than available grip allows). */
  speedMarginKmh: number;
  effectiveRadius_m: number;
  downforceN: number;
  dragN: number;
  effectiveMu: number;
  lateralAccelG: number;
  requiredDecelG: number;
  distanceProfile: Array<{
    dist_m: number;
    speed_ms: number;
    lateralG: number;
    longG: number;
  }>;
}
