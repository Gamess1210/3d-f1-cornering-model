/**
 * Three.js geometry utilities for the track layer.
 *
 * Wraps the pure 2D helpers in cornerData.ts and lifts them into world space:
 *   world.x = data.x,  world.y = elevationAt(dist),  world.z = -data.y
 *
 * Everything here is pure (no React); the scene components memoise the results.
 */

import * as THREE from "three";
import {
  sampleCenterline2D,
  segmentEnd,
  segmentStart,
  type CornerData,
} from "./cornerData";

export interface TrackFrame {
  /** Centerline point in world space (y = elevation). */
  position: THREE.Vector3;
  /** Unit direction of travel, including slope. */
  tangent: THREE.Vector3;
  /** Track-surface normal (banking applied). */
  up: THREE.Vector3;
  /** Unit vector toward the RIGHT edge of the track (banking applied). */
  right: THREE.Vector3;
  wLeft: number;
  wRight: number;
  dist_m: number;
  radius_m: number;
  /** +1 = turning left, -1 = turning right, 0 = straight. */
  turnSign: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DERIV_H = 1.0; // metres, numerical derivative step

export function clampDist(corner: CornerData, dist_m: number): number {
  return Math.min(segmentEnd(corner), Math.max(segmentStart(corner), dist_m));
}

/** 3D frame at an arc-length distance along the corner. Clamps to the segment. */
export function sampleTrack(corner: CornerData, dist_m: number): TrackFrame {
  const d = clampDist(corner, dist_m);
  const s = sampleCenterline2D(corner.centerline, d);
  const elev = corner.elevationAt(d);

  // Slope: central difference on the elevation profile (clamped at the ends).
  const d0 = clampDist(corner, d - DERIV_H);
  const d1 = clampDist(corner, d + DERIV_H);
  const slope = d1 > d0 ? (corner.elevationAt(d1) - corner.elevationAt(d0)) / (d1 - d0) : 0;

  const position = new THREE.Vector3(s.x, elev, -s.y);

  // 2D tangent from a central difference of POSITION (not the piecewise segment
  // direction): the raw centerline is polyline data with ~5 m knots, and on a
  // 17 m hairpin the segment direction jumps ~17 deg at each knot, which makes
  // adjacent ribbon cross-sections cross on the inside (dark folded slivers).
  // The central difference is continuous across knots.
  const TAN_H = 2.5;
  const pa = sampleCenterline2D(corner.centerline, clampDist(corner, d - TAN_H));
  const pb = sampleCenterline2D(corner.centerline, clampDist(corner, d + TAN_H));
  let tx = pb.x - pa.x;
  let ty = pb.y - pa.y;
  const tl = Math.hypot(tx, ty);
  if (tl < 1e-6) {
    tx = s.tx;
    ty = s.ty;
  } else {
    tx /= tl;
    ty /= tl;
  }
  const tangent = new THREE.Vector3(tx, slope, -ty).normalize();

  // Right-hand basis: right = tangent x worldUp, up = right x tangent.
  const right = new THREE.Vector3().crossVectors(tangent, WORLD_UP);
  if (right.lengthSq() < 1e-8) right.set(0, 0, 1);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, tangent).normalize();

  // Turn direction from the change in the 2D tangent (CCW in data space = left turn).
  const s1 = sampleCenterline2D(corner.centerline, d1);
  const s0 = sampleCenterline2D(corner.centerline, d0);
  const cross = s0.tx * s1.ty - s0.ty * s1.tx;
  let turnSign = Math.abs(cross) > 1e-6 ? Math.sign(cross) : 0;
  if (turnSign === 0 && s.radius_m < 5000) {
    turnSign = corner.primaryApex.direction === "left" ? 1 : -1;
  }

  // Banking: tilt the surface toward the inside of the turn. Rotating about the
  // tangent by a positive angle drops the right edge, so a LEFT turn (inside on
  // the left) needs a negative angle to raise the right edge.
  const bankDeg = corner.bankingAt(d);
  if (bankDeg !== 0 && turnSign !== 0) {
    const q = new THREE.Quaternion().setFromAxisAngle(
      tangent,
      -turnSign * THREE.MathUtils.degToRad(bankDeg)
    );
    right.applyQuaternion(q);
    up.applyQuaternion(q);
  }

  return {
    position,
    tangent,
    up,
    right,
    wLeft: s.wLeft,
    wRight: s.wRight,
    dist_m: d,
    radius_m: s.radius_m,
    turnSign,
  };
}

/** Evenly spaced distances from segment start to end (inclusive of the end). */
export function sampleDistances(corner: CornerData, step_m: number, from?: number, to?: number): number[] {
  const a = clampDist(corner, from ?? segmentStart(corner));
  const b = clampDist(corner, to ?? segmentEnd(corner));
  const out: number[] = [];
  for (let d = a; d < b; d += step_m) out.push(d);
  out.push(b);
  return out;
}

export interface StripOptions {
  step_m?: number;
  /** Lateral offsets (metres, + = right) for the two edges of the strip, per frame. */
  offsets: (f: TrackFrame) => [number, number];
  /** Vertical lift along the surface normal (metres), same for both edges. */
  lift?: number;
  /** Per-edge WORLD-Y lift (metres) -- overrides `lift`; lets a strip's outer edge droop to the floor. */
  lifts?: (f: TrackFrame) => [number, number];
  /** Optional vertex color, evaluated per frame; a tuple gives [edgeA, edgeB] colors. */
  color?: (f: TrackFrame) => THREE.Color | [THREE.Color, THREE.Color];
  from?: number;
  to?: number;
}

/**
 * Generic ribbon builder: two vertices per frame, indexed quads, uv.x across the
 * strip (0..1) and uv.y = dist along the track (metres), computed normals.
 */
export function buildStrip(corner: CornerData, opts: StripOptions): THREE.BufferGeometry {
  const step = opts.step_m ?? 1.5;
  const lift = opts.lift ?? 0;
  const dists = sampleDistances(corner, step, opts.from, opts.to);
  const n = dists.length;

  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const colors = opts.color ? new Float32Array(n * 2 * 3) : null;
  const indices: number[] = [];

  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const f = sampleTrack(corner, dists[i]);
    const [oa, ob] = opts.offsets(f);
    const base = f.position.clone().addScaledVector(f.up, lift);
    const [la, lb] = opts.lifts ? opts.lifts(f) : [0, 0];

    tmp.copy(base).addScaledVector(f.right, oa);
    tmp.y += la;
    positions.set([tmp.x, tmp.y, tmp.z], (i * 2) * 3);
    tmp.copy(base).addScaledVector(f.right, ob);
    tmp.y += lb;
    positions.set([tmp.x, tmp.y, tmp.z], (i * 2 + 1) * 3);

    uvs.set([0, f.dist_m], (i * 2) * 2);
    uvs.set([1, f.dist_m], (i * 2 + 1) * 2);

    if (colors && opts.color) {
      const c = opts.color(f);
      const [ca, cb] = Array.isArray(c) ? c : [c, c];
      colors.set([ca.r, ca.g, ca.b], (i * 2) * 3);
      colors.set([cb.r, cb.g, cb.b], (i * 2 + 1) * 3);
    }

    if (i < n - 1) {
      const l0 = i * 2;
      const r0 = i * 2 + 1;
      const l1 = (i + 1) * 2;
      const r1 = (i + 1) * 2 + 1;
      // CCW seen from above -> normal points along `up`.
      indices.push(l0, r0, l1, r0, r1, l1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  if (colors) geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** The asphalt ribbon, [-wLeft, +wRight] around the centerline. */
export function buildTrackRibbon(
  corner: CornerData,
  opts: { step_m?: number } = {}
): THREE.BufferGeometry {
  return buildStrip(corner, {
    step_m: opts.step_m ?? 1.5,
    offsets: (f) => [-f.wLeft, f.wRight],
  });
}

/** Thin white edge line on one side, sitting just above the asphalt. */
export function buildTrackEdges(
  corner: CornerData,
  side: "left" | "right",
  width_m = 0.3,
  lift = 0.02
): THREE.BufferGeometry {
  return buildStrip(corner, {
    step_m: 1.5,
    lift,
    offsets: (f) =>
      side === "left" ? [-f.wLeft, -f.wLeft + width_m] : [f.wRight - width_m, f.wRight],
  });
}

/**
 * Red/white kerbs on the INSIDE of each apex marker (±halfLength_m around the
 * apex), as vertex-coloured strips just outside the white line. One geometry per apex.
 */
export function buildKerbs(
  corner: CornerData,
  opts: { halfLength_m?: number; width_m?: number; block_m?: number } = {}
): THREE.BufferGeometry[] {
  const half = opts.halfLength_m ?? 30;
  const width = opts.width_m ?? 1.2;
  const block = opts.block_m ?? 2.5;
  const red = new THREE.Color("#d8262b");
  const white = new THREE.Color("#f2f2f2");

  return corner.apexMarkers.map((m) =>
    buildStrip(corner, {
      step_m: block / 2,
      lift: 0.03,
      from: m.dist_m - half,
      to: m.dist_m + half,
      offsets: (f) =>
        m.direction === "left" ? [-f.wLeft - width, -f.wLeft] : [f.wRight, f.wRight + width],
      color: (f) => (Math.floor(f.dist_m / block) % 2 === 0 ? red : white),
    })
  );
}

export interface EmbankmentOptions {
  /** Half-width of the flat shoulder either side of the centerline (metres). */
  flatHalfWidth_m?: number;
  /** Half-width where the hillside meets the floor plane (metres). */
  outerHalfWidth_m?: number;
  /** How far below the asphalt the flat shoulder sits (metres). */
  drop_m?: number;
  /** World-Y of the floor plane the hillside blends into. */
  floorY?: number;
  step_m?: number;
  /** Flat-shoulder colour (near the track). */
  innerColor?: THREE.Color;
  /** Colour at the floor seam (should match the floor plane). */
  outerColor?: THREE.Color;
}

/**
 * Grass "embankment" under the track: a flat vertex-coloured shoulder that
 * follows the elevation, plus two hillside strips that droop down to the floor
 * plane so the Eau Rouge climb reads as a hill and there is no hard edge.
 * Returns [centre, leftHillside, rightHillside]; all have a `color` attribute.
 */
export function buildEmbankment(corner: CornerData, opts: EmbankmentOptions = {}): THREE.BufferGeometry[] {
  const flat = opts.flatHalfWidth_m ?? 45;
  const outer = opts.outerHalfWidth_m ?? 120;
  const drop = opts.drop_m ?? 0.3;
  const floorY = opts.floorY ?? -6;
  const step = opts.step_m ?? 3;
  const inner = opts.innerColor ?? new THREE.Color("#37603a");
  const outerC = opts.outerColor ?? new THREE.Color("#3f6b3a");
  const seam = 0.05; // sit just above the floor plane to avoid z-fighting

  // World-Y needed to bring a shoulder vertex down onto the floor plane.
  const toFloor = (f: TrackFrame) => floorY + seam - (f.position.y - drop);

  const centre = buildStrip(corner, {
    step_m: step,
    lift: -drop,
    offsets: () => [-flat, flat],
    color: () => inner,
  });
  const left = buildStrip(corner, {
    step_m: step,
    lift: -drop,
    offsets: () => [-outer, -flat],
    lifts: (f) => [Math.min(0, toFloor(f)), 0],
    color: () => [outerC, inner],
  });
  const right = buildStrip(corner, {
    step_m: step,
    lift: -drop,
    offsets: () => [flat, outer],
    lifts: (f) => [0, Math.min(0, toFloor(f))],
    color: () => [inner, outerC],
  });
  return [centre, left, right];
}

export interface TerrainOptions {
  /** Lateral distance from the centerline over which the ground stays at track height (metres). */
  flatHalfWidth_m?: number;
  /** Lateral distance at which the hillside has fully blended into the floor plane (metres). */
  outerHalfWidth_m?: number;
  /** How far below the asphalt the shoulder sits (metres). */
  drop_m?: number;
  /** World-Y of the floor plane the terrain blends into. */
  floorY?: number;
  /** Grid cell size (metres). Auto if omitted. */
  cell_m?: number;
  innerColor?: THREE.Color;
  outerColor?: THREE.Color;
}

const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Heightfield terrain under the track. For every grid vertex the height is the
 * elevation of the NEAREST centerline point (minus `drop_m`), blended down to the
 * floor plane between `flatHalfWidth_m` and `outerHalfWidth_m`. Unlike an offset
 * ribbon this can never fold over itself on the inside of a tight hairpin.
 * Vertex-coloured inner -> outer; normals computed.
 */
export function buildTerrain(corner: CornerData, opts: TerrainOptions = {}): THREE.BufferGeometry {
  const flat = opts.flatHalfWidth_m ?? 45;
  const outer = opts.outerHalfWidth_m ?? 120;
  const drop = opts.drop_m ?? 0.3;
  const floorY = opts.floorY ?? -6;
  const inner = opts.innerColor ?? new THREE.Color("#37603a");
  const outerC = opts.outerColor ?? new THREE.Color("#3f6b3a");
  const seam = 0.08; // sit just above the floor plane to avoid z-fighting

  // Centerline samples (world xz + elevation).
  const dists = sampleDistances(corner, 3);
  const sx = new Float64Array(dists.length);
  const sz = new Float64Array(dists.length);
  const se = new Float64Array(dists.length);
  const box = new THREE.Box3();
  for (let i = 0; i < dists.length; i++) {
    const f = sampleTrack(corner, dists[i]);
    sx[i] = f.position.x;
    sz[i] = f.position.z;
    se[i] = f.position.y;
    box.expandByPoint(f.position);
  }

  const margin = outer + 15;
  const x0 = box.min.x - margin;
  const x1 = box.max.x + margin;
  const z0 = box.min.z - margin;
  const z1 = box.max.z + margin;
  const cell = opts.cell_m ?? Math.min(6, Math.max(3, Math.max(x1 - x0, z1 - z0) / 110));
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const nz = Math.ceil((z1 - z0) / cell) + 1;

  const positions = new Float32Array(nx * nz * 3);
  const colors = new Float32Array(nx * nz * 3);
  const uvs = new Float32Array(nx * nz * 2);
  const c = new THREE.Color();

  for (let j = 0; j < nz; j++) {
    const z = z0 + j * cell;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * cell;
      // Nearest centerline sample (brute force; ~20k x ~200 once per corner).
      let best = Infinity;
      let bi = 0;
      for (let k = 0; k < sx.length; k++) {
        const dx = sx[k] - x;
        const dz = sz[k] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) {
          best = d2;
          bi = k;
        }
      }
      const lateral = Math.sqrt(best);
      const t = smooth01(flat, outer, lateral);
      const y = THREE.MathUtils.lerp(se[bi] - drop, floorY + seam, t);
      const v = j * nx + i;
      positions[v * 3] = x;
      positions[v * 3 + 1] = y;
      positions[v * 3 + 2] = z;
      c.copy(inner).lerp(outerC, t);
      colors[v * 3] = c.r;
      colors[v * 3 + 1] = c.g;
      colors[v * 3 + 2] = c.b;
      uvs[v * 2] = i / (nx - 1);
      uvs[v * 2 + 1] = j / (nz - 1);
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const cIdx = a + nx;
      const d = cIdx + 1;
      // CCW seen from above (+y): x increases with i, z increases with j.
      indices.push(a, cIdx, b, b, cIdx, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export interface ContourLine {
  /** Elevation level, metres. */
  level_m: number;
  /** Arc-length distance where the centerline crosses this level. */
  dist_m: number;
  /** Straight line across the flat embankment shoulder at that distance. */
  points: THREE.Vector3[];
  /** Label anchor at the right-hand end of the line. */
  labelPos: THREE.Vector3;
}

/**
 * Elevation contour ticks: for each `spacing_m` level between the min and max
 * elevation, find (by bisection on the monotonic stretch) where the centerline
 * crosses it and return a line across the flat shoulder. Empty for flat corners.
 */
export function buildContours(
  corner: CornerData,
  opts: { spacing_m?: number; halfWidth_m?: number; lift?: number } = {}
): ContourLine[] {
  const spacing = opts.spacing_m ?? 5;
  const hw = opts.halfWidth_m ?? 45;
  const lift = opts.lift ?? 0.15;
  const dists = sampleDistances(corner, 2);
  const elev = dists.map((d) => corner.elevationAt(d));
  const min = Math.min(...elev);
  const max = Math.max(...elev);
  if (max - min < spacing) return [];

  const out: ContourLine[] = [];
  for (let level = Math.ceil(min / spacing) * spacing; level <= max; level += spacing) {
    if (Math.abs(level) < 1e-6) continue; // skip the datum
    // First crossing along the segment.
    let idx = -1;
    for (let i = 0; i < dists.length - 1; i++) {
      if ((elev[i] - level) * (elev[i + 1] - level) <= 0 && elev[i] !== elev[i + 1]) {
        idx = i;
        break;
      }
    }
    if (idx < 0) continue;
    let a = dists[idx];
    let b = dists[idx + 1];
    for (let k = 0; k < 24; k++) {
      const m = (a + b) / 2;
      if ((corner.elevationAt(a) - level) * (corner.elevationAt(m) - level) <= 0) b = m;
      else a = m;
    }
    const d = (a + b) / 2;
    const f = sampleTrack(corner, d);
    const y = f.position.y - 0.3 + lift; // on the flat shoulder surface
    const pts: THREE.Vector3[] = [];
    for (let o = -hw; o <= hw; o += hw / 4) {
      const p = f.position.clone().addScaledVector(f.right, o);
      p.y = y;
      pts.push(p);
    }
    const labelPos = f.position.clone().addScaledVector(f.right, hw + 3);
    labelPos.y = y;
    out.push({ level_m: level, dist_m: d, points: pts, labelPos });
  }
  return out;
}

/** Centerline polyline lifted slightly off the surface for a glowing racing line. */
export function buildRacingLine(corner: CornerData, step_m = 1.5, lift = 0.08): THREE.Vector3[] {
  return sampleDistances(corner, step_m).map((d) => {
    const f = sampleTrack(corner, d);
    return f.position.clone().addScaledVector(f.up, lift);
  });
}

/** World-space bounding box of the centerline (useful for lights / shadow cameras). */
export function trackBounds(corner: CornerData): THREE.Box3 {
  const box = new THREE.Box3();
  for (const d of sampleDistances(corner, 10)) box.expandByPoint(sampleTrack(corner, d).position);
  return box;
}
