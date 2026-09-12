/**
 * The moving F1 car. Drives the selected corner segment in a loop, with a
 * speed profile taken from the physics result, and REACTS to the result:
 *
 *  - on the limit  : classic out-in-out racing line, accelerates out of the apex
 *  - over the limit: from ~15 m before the apex it runs wide toward the OUTSIDE,
 *                    ends up on the grass beyond the edge, slips/yaws toward the
 *                    inside, rolls to the outside and decelerates to a crawl
 *
 * Everything per-frame lives in refs + the shared mutable `carPose` object
 * (read by the camera rig) -- no React state is set inside useFrame.
 *
 * Track framing is implemented locally (2D centerline sampler + elevation) so
 * this file has no dependency on src/track/geometry.ts.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useSim } from "../state/store";
import { sampleCenterline2D, segmentEnd, segmentStart, type CornerData } from "../track/cornerData";
import { carPose } from "./carPose";
import Car, { type CarLivePose } from "./Car";

// ---------------------------------------------------------------------------
// Track frame (world space). world.x = x, world.y = elevation, world.z = -y
// ---------------------------------------------------------------------------

interface Frame {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  wLeft: number;
  wRight: number;
  radius_m: number;
  /** +1 = turning left (driver's view), -1 = turning right, 0 = straight. */
  turnSign: number;
}

function makeFrame(): Frame {
  return {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(0, 0, 1),
    wLeft: 5,
    wRight: 5,
    radius_m: 9999,
    turnSign: 0,
  };
}

/** Fill `out` with the frame at an arc-length distance (allocation-free). */
function frameInto(corner: CornerData, dist_m: number, out: Frame): Frame {
  const s = sampleCenterline2D(corner.centerline, dist_m);
  const slope = (corner.elevationAt(dist_m + 1) - corner.elevationAt(dist_m - 1)) / 2;
  const t = out.tangent.set(s.tx, slope, -s.ty).normalize();
  const up = out.up.set(0, 1, 0).addScaledVector(t, -t.y).normalize();
  const right = out.right.crossVectors(t, up).normalize();
  // Banking: positive = surface tilts toward the inside of the turn, so the normal leans inside.
  const inside = corner.primaryApex.direction === "right" ? 1 : -1;
  const bank = THREE.MathUtils.degToRad(corner.bankingAt(dist_m)) * inside;
  if (bank !== 0) {
    up.multiplyScalar(Math.cos(bank)).addScaledVector(right, Math.sin(bank)).normalize();
    right.crossVectors(t, up).normalize();
  }
  out.position.set(s.x, corner.elevationAt(dist_m), -s.y);
  out.wLeft = s.wLeft;
  out.wRight = s.wRight;
  out.radius_m = Math.max(1, s.radius_m);
  // Local turn direction from the change of heading over the next few metres (2D, data space).
  const s2 = sampleCenterline2D(corner.centerline, dist_m + 6);
  const cross = s.tx * s2.ty - s.ty * s2.tx;
  out.turnSign = Math.abs(cross) < 1e-4 ? 0 : Math.sign(cross);
  return out;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const DEG = Math.PI / 180;
const TYRE_R = 0.36;
const PAUSE_S = 0.8;
const CRAWL_MS = 6;

// Trail ribbon: ring buffer of the car's last positions.
const TRAIL_N = 28;
const TRAIL_STEP_M = 1.5;
const TRAIL_HALF_W = 0.85;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();

interface SimRef {
  dist: number;
  speed: number;
  lateral: number;
  slip: number;
  pausing: boolean;
  pauseT: number;
  offTrack: boolean;
  trailCount: number;
  trailLastDist: number;
  trailDirty: boolean;
}

export default function CarOnTrack() {
  const corner = useSim((s) => s.corner);
  const result = useSim((s) => s.result);
  const params = useSim((s) => s.params);
  const lapResetToken = useSim((s) => s.lapResetToken);

  const dir = corner.primaryApex.direction;
  const insideSign = dir === "right" ? 1 : -1; // lateral axis is the driver's RIGHT (+)
  const outsideSign = -insideSign;
  const yawInside = -insideSign; // rotation about +Y: positive turns the nose LEFT

  const start = segmentStart(corner);
  const end = segmentEnd(corner);
  const apexD = corner.apexDist_m;

  // Braking-zone speed profile, sorted by dist_m (negative before apex, 0 at apex).
  const profile = useMemo(
    () => [...result.distanceProfile].sort((a, b) => a.dist_m - b.dist_m),
    [result]
  );

  // Frame data at the apex (for widths, ghost placement).
  const apexFrame = useMemo(() => frameInto(corner, apexD, makeFrame()), [corner, apexD]);
  const wOutsideApex = dir === "right" ? apexFrame.wLeft : apexFrame.wRight;
  const wInsideApex = dir === "right" ? apexFrame.wRight : apexFrame.wLeft;
  const insideLateral = insideSign * 0.6 * wInsideApex;

  const over = Math.max(0, result.speedMarginKmh);
  const onLimit = result.isOnLimit;

  // --- Refs -------------------------------------------------------------------
  const carRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const speedTextRef = useRef<HTMLSpanElement>(null);
  const trailMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const frame = useRef<Frame>(makeFrame());
  const live = useRef<CarLivePose>({ steer: 0, roll: 0, wheelSpeed: 0 });
  const sim = useRef<SimRef>({
    dist: start,
    speed: params.approachSpeed_ms,
    lateral: 0,
    slip: 0,
    pausing: false,
    pauseT: 0,
    offTrack: false,
    trailCount: 0,
    trailLastDist: -Infinity,
    trailDirty: false,
  });
  const fastForwarded = useRef(false);

  // Trail ribbon geometry (triangle strip, fixed capacity, updated in place).
  const trailGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    return g;
  }, []);
  useEffect(() => () => trailGeom.dispose(), [trailGeom]);
  const trailSamples = useRef<Float32Array>(new Float32Array(TRAIL_N * 6)); // pos(3) + right(3) per sample

  // Restart the lap on corner change / explicit reset.
  useEffect(() => {
    const s = sim.current;
    s.dist = start;
    s.speed = useSim.getState().params.approachSpeed_ms;
    s.lateral = outsideSign * 0.6 * wOutsideApex;
    s.slip = 0;
    s.pausing = false;
    s.pauseT = 0;
    s.offTrack = false;
    s.trailCount = 0;
    s.trailLastDist = -Infinity;
    s.trailDirty = true;
    trailGeom.setDrawRange(0, 0);
    if (carRef.current) carRef.current.visible = true;
  }, [corner, lapResetToken, start, outsideSign, wOutsideApex, trailGeom]);

  // --- Speed profile ------------------------------------------------------------
  const speedBeforeApex = (d: number): number => {
    const bp = Math.max(0, params.brakingPointBeforeApex_m);
    const v0 = params.approachSpeed_ms;
    const brakeStart = apexD - bp;
    if (d <= brakeStart || bp <= 0) return v0;
    const rel = d - apexD; // negative
    if (profile.length === 0) {
      return THREE.MathUtils.lerp(v0, result.achievedApexSpeed_ms, (d - brakeStart) / bp);
    }
    if (rel <= profile[0].dist_m) return profile[0].speed_ms;
    const last = profile[profile.length - 1];
    if (rel >= last.dist_m) return last.speed_ms;
    let lo = 0;
    let hi = profile.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (profile[mid].dist_m <= rel) lo = mid;
      else hi = mid;
    }
    const a = profile[lo];
    const b = profile[hi];
    const t = (rel - a.dist_m) / (b.dist_m - a.dist_m || 1);
    return a.speed_ms + (b.speed_ms - a.speed_ms) * t;
  };

  // --- Lateral line -------------------------------------------------------------
  const racingLineLateral = (d: number, f: Frame): number => {
    const wOut = dir === "right" ? f.wLeft : f.wRight;
    const wIn = dir === "right" ? f.wRight : f.wLeft;
    const outEntry = outsideSign * 0.6 * wOut;
    const inApex = insideSign * 0.6 * wIn;
    const outExit = outsideSign * 0.6 * wOut;
    if (d <= apexD) return THREE.MathUtils.lerp(outEntry, inApex, smoothstep(apexD - 60, apexD, d));
    const toOut = THREE.MathUtils.lerp(inApex, outExit, smoothstep(apexD, apexD + 60, d));
    // Drift back toward the centre once the corner is done so long straights look natural.
    return THREE.MathUtils.lerp(toOut, 0, smoothstep(apexD + 80, apexD + 160, d));
  };

  const runWideLateral = (d: number, f: Frame): number => {
    const wOut = dir === "right" ? f.wLeft : f.wRight;
    const target = outsideSign * (wOut + THREE.MathUtils.clamp(over * 0.35, 2, 8));
    const k = smoothstep(apexD - 15, apexD + 30, d);
    return THREE.MathUtils.lerp(racingLineLateral(Math.min(d, apexD - 15), f), target, k);
  };

  // --- Simulation step (pure state update; also used for ?t= fast-forward) -------
  const stepSim = (dt: number, playing: boolean, playbackRate: number) => {
    const s = sim.current;
    const f = frame.current;
    const sdt = playing ? dt * playbackRate : 0;

    // End-of-segment pause, then teleport back to the start.
    if (s.pausing) {
      if (playing) s.pauseT += dt;
      if (s.pauseT >= PAUSE_S) {
        s.pausing = false;
        s.pauseT = 0;
        s.dist = start;
        s.speed = params.approachSpeed_ms;
        s.slip = 0;
        s.offTrack = false;
        s.trailCount = 0;
        s.trailLastDist = -Infinity;
        s.trailDirty = true;
        frameInto(corner, s.dist, f);
        s.lateral = racingLineLateral(s.dist, f);
      }
    } else {
      // Longitudinal.
      if (s.dist <= apexD) {
        s.speed = speedBeforeApex(s.dist);
      } else if (onLimit) {
        s.speed = Math.min(params.approachSpeed_ms * 1.1, s.speed + 9 * sdt);
      } else if (s.offTrack) {
        s.speed = Math.max(CRAWL_MS, s.speed - 12 * sdt);
      } // else: over the limit but still on tarmac -> lift, hold speed
      s.dist += s.speed * sdt;
      if (s.dist >= end) {
        s.dist = end;
        s.pausing = true;
        s.pauseT = 0;
      }
    }

    frameInto(corner, s.dist, f);

    // Lateral + slip targets, smoothed so slider changes mid-lap animate.
    const targetLat = onLimit ? racingLineLateral(s.dist, f) : runWideLateral(s.dist, f);
    const slipAmt = onLimit ? 0 : THREE.MathUtils.clamp(over * 0.5, 3, 8) * smoothstep(apexD - 15, apexD + 10, s.dist);
    const targetSlip = yawInside * slipAmt * DEG;
    const k = Math.min(1, dt * 6);
    s.lateral += (targetLat - s.lateral) * k;
    s.slip += (targetSlip - s.slip) * k;

    const wOutHere = dir === "right" ? f.wLeft : f.wRight;
    s.offTrack = !onLimit && s.lateral * outsideSign > wOutHere;

    // Trail ring buffer sample (world pos + right vector), every TRAIL_STEP_M of travel.
    if (s.dist - s.trailLastDist >= TRAIL_STEP_M || s.dist < s.trailLastDist) {
      s.trailLastDist = s.dist;
      const buf = trailSamples.current;
      if (s.trailCount >= TRAIL_N) {
        buf.copyWithin(0, 6, TRAIL_N * 6);
        s.trailCount = TRAIL_N - 1;
      }
      const o = s.trailCount * 6;
      _tmp.copy(f.position).addScaledVector(f.right, s.lateral).addScaledVector(f.up, 0.05);
      buf[o] = _tmp.x;
      buf[o + 1] = _tmp.y;
      buf[o + 2] = _tmp.z;
      buf[o + 3] = f.right.x;
      buf[o + 4] = f.right.y;
      buf[o + 5] = f.right.z;
      s.trailCount++;
      s.trailDirty = true;
    }
  };

  // Deep-link / screenshot helper: `?t=8` fast-forwards the first lap by 8 s of wall time.
  useEffect(() => {
    if (fastForwarded.current || typeof window === "undefined") return;
    fastForwarded.current = true;
    const t = Number(new URLSearchParams(window.location.search).get("t"));
    if (!(t > 0)) return;
    const { playbackRate } = useSim.getState();
    const n = Math.min(Math.round(t * 60), 60 * 120);
    for (let i = 0; i < n; i++) stepSim(1 / 60, true, playbackRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Per-frame: advance + drive the visuals ------------------------------------
  useFrame((_, rawDt) => {
    const s = sim.current;
    const f = frame.current;
    const { playing, playbackRate } = useSim.getState();
    const dt = Math.min(rawDt, 0.05);
    stepSim(dt, playing, playbackRate);

    const car = carRef.current;
    if (car) {
      car.visible = !s.pausing || s.pauseT < PAUSE_S * 0.5;
      car.position.copy(f.position).addScaledVector(f.right, s.lateral);
      _m.makeBasis(f.tangent, f.up, f.right);
      _q.setFromRotationMatrix(_m);
      _qYaw.setFromAxisAngle(_yAxis, s.slip);
      car.quaternion.copy(_q).multiply(_qYaw);
    }

    // Live car pose: wheel spin, steer from local curvature, roll from lateral G.
    const latG = (s.speed * s.speed) / f.radius_m / 9.81;
    const turn = f.turnSign !== 0 ? f.turnSign : yawInside;
    const steerDeg = THREE.MathUtils.clamp((4 / f.radius_m) * 60, 0, 12) + (s.offTrack ? 4 : 0);
    live.current.steer = turn * steerDeg * DEG;
    live.current.roll = turn * THREE.MathUtils.clamp(latG * 1.2, 0, 4) * DEG; // lean away from the turn
    live.current.wheelSpeed = (s.speed / TYRE_R) * (playing ? playbackRate : 0);

    // Shared pose for the camera rig / HUD.
    carPose.position.copy(f.position).addScaledVector(f.right, s.lateral);
    carPose.forward.copy(f.tangent);
    carPose.up.copy(f.up);
    carPose.dist_m = s.dist;
    carPose.speed_ms = s.speed;
    carPose.offTrack = s.offTrack;

    // Trail ribbon geometry upload (only when new samples were recorded).
    if (s.trailDirty) {
      s.trailDirty = false;
      const buf = trailSamples.current;
      const pos = trailGeom.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < s.trailCount; i++) {
        const b = i * 6;
        const v = i * 6; // 2 verts * 3 comps
        arr[v] = buf[b] - buf[b + 3] * TRAIL_HALF_W;
        arr[v + 1] = buf[b + 1] - buf[b + 4] * TRAIL_HALF_W;
        arr[v + 2] = buf[b + 2] - buf[b + 5] * TRAIL_HALF_W;
        arr[v + 3] = buf[b] + buf[b + 3] * TRAIL_HALF_W;
        arr[v + 4] = buf[b + 1] + buf[b + 4] * TRAIL_HALF_W;
        arr[v + 5] = buf[b + 2] + buf[b + 5] * TRAIL_HALF_W;
      }
      pos.needsUpdate = true;
      trailGeom.setDrawRange(0, Math.max(0, (s.trailCount - 1) * 6));
      trailGeom.computeBoundingSphere();
    }
    const mat = trailMatRef.current;
    if (mat) {
      if (s.offTrack) {
        mat.color.set("#ff3b3b");
        mat.opacity = 0.7;
      } else {
        mat.color.set("#ffffff");
        mat.opacity = 0.22;
      }
    }

    // Label (DOM updated directly, no React state).
    if (speedTextRef.current) speedTextRef.current.textContent = `${Math.round(s.speed * 3.6)} km/h`;
    if (labelRef.current) {
      const c = s.offTrack ? "#ff4d4d" : onLimit ? "#38e07b" : "#ffb02e";
      labelRef.current.style.color = c;
      labelRef.current.style.borderColor = c;
    }
  });

  // Ghost marker: where a car on the limit sits at the apex.
  const ghostQuat = useMemo(() => {
    const m = new THREE.Matrix4().makeBasis(apexFrame.tangent, apexFrame.up, apexFrame.right);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [apexFrame]);
  const ghostPos = useMemo(
    () => apexFrame.position.clone().addScaledVector(apexFrame.right, insideLateral),
    [apexFrame, insideLateral]
  );

  return (
    <group>
      {/* The real car */}
      <group ref={carRef}>
        <Car color="#d81e1e" accent="#f5f5f5" live={live.current} />
        <Html position={[0, 2.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div
            ref={labelRef}
            style={{
              fontFamily: "system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1.1,
              color: "#38e07b",
              background: "rgba(10,10,14,0.75)",
              border: "1px solid #38e07b",
              borderRadius: 6,
              padding: "3px 7px",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            <span ref={speedTextRef}>{Math.round(params.approachSpeed_ms * 3.6)} km/h</span>
            <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.85 }}>
              {onLimit ? "on the limit" : `+${over.toFixed(0)} km/h over the limit`}
            </div>
          </div>
        </Html>
      </group>

      {/* Ghost: the on-limit apex position, shown only when the real car is over the limit */}
      <group position={ghostPos} quaternion={ghostQuat} visible={!onLimit}>
        <Car color="#d81e1e" accent="#f5f5f5" ghost steer={yawInside * 5 * DEG} />
      </group>

      {/* Skid / path ribbon following the car's last ~40 m */}
      <mesh geometry={trailGeom} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial
          ref={trailMatRef}
          color="#ffffff"
          transparent
          opacity={0.22}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    </group>
  );
}
