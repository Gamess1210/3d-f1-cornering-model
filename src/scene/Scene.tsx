/**
 * 3D scene: track ribbon, edges, kerbs, racing line, apex markers, embankment,
 * elevation contours, daytime lighting and a camera rig that flies to each
 * corner's cameraHint.
 *
 * URL overrides (read once on mount):
 *   ?cam=car                       close-up on the primary apex from the outside of the corner
 *   ?cam=px,py,pz,tx,ty,tz         explicit camera position + orbit target (debug / screenshots)
 *
 * The car is rendered by ./CarOnTrack (owned by another module).
 */

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, Line, OrbitControls, Sky } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useSim } from "../state/store";
import type { CornerData } from "../track/cornerData";
import {
  buildContours,
  buildKerbs,
  buildRacingLine,
  buildTrackEdges,
  buildTrackRibbon,
  buildTerrain,
  sampleTrack,
  trackBounds,
} from "../track/geometry";
import CarOnTrack from "./CarOnTrack";
import { carPose } from "./carPose";

const HAZE = "#b9c6d2";
const FLOOR_Y = -6;
const FLOOR_COLOR = "#3f6b3a";
const EMBANKMENT_COLOR = "#37603a";
const LINE_ON = "#2ee6b8";
const LINE_OFF = "#ff5a3c";
/** Sun direction (world offset from the track centre). Shared by the light and the sky. */
const SUN_DIR = new THREE.Vector3(-0.62, 0.4, 0.55).normalize(); // low sun (~24 deg) for long shadows

/** Debug toggles from the URL (?dbg=nocar,noshadow) -- for screenshot diagnosis only. */
const DBG = new Set(
  typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("dbg") ?? "").split(",") : []
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cheap procedural asphalt: grey noise tile, repeated along the track. */
function makeAsphaltTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 190 + Math.floor(Math.random() * 65);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v + 4;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // uv.x spans the width once; uv.y is metres -> one tile per 6 m.
  tex.repeat.set(1, 1 / 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dispose a geometry when the component unmounts / geometry changes. */
function useDisposable<T extends { dispose: () => void }>(value: T): T {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** Swallows Environment fetch failures (offline demo) instead of killing the canvas. */
class SoftBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type CamGoal = { position: THREE.Vector3; target: THREE.Vector3 };

/** Resolve the initial camera from the URL (?cam=...) or fall back to the corner hint. */
function resolveInitialCamera(corner: CornerData): CamGoal | null {
  if (typeof window === "undefined") return null;
  const cam = new URLSearchParams(window.location.search).get("cam");
  if (!cam) return null;
  if (cam === "car") {
    const f = sampleTrack(corner, corner.apexDist_m);
    const outside = corner.primaryApex.direction === "right" ? -1 : 1; // outside is opposite the turn
    const position = f.position
      .clone()
      .addScaledVector(f.right, outside * 15)
      .addScaledVector(f.tangent, -9)
      .addScaledVector(f.up, 6);
    const target = f.position.clone().addScaledVector(f.up, 0.6);
    return { position, target };
  }
  const nums = cam.split(",").map(Number);
  if (nums.length === 6 && nums.every((n) => Number.isFinite(n))) {
    return {
      position: new THREE.Vector3(nums[0], nums[1], nums[2]),
      target: new THREE.Vector3(nums[3], nums[4], nums[5]),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Track pieces
// ---------------------------------------------------------------------------

function TrackRibbon({ corner }: { corner: CornerData }) {
  const geo = useDisposable(useMemo(() => buildTrackRibbon(corner), [corner]));
  const tex = useMemo(makeAsphaltTexture, []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial
        color="#55585e"
        map={tex ?? undefined}
        roughness={0.9}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function TrackEdges({ corner }: { corner: CornerData }) {
  const left = useDisposable(useMemo(() => buildTrackEdges(corner, "left"), [corner]));
  const right = useDisposable(useMemo(() => buildTrackEdges(corner, "right"), [corner]));
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.6 }), []);
  return (
    <group>
      <mesh geometry={left} material={mat} />
      <mesh geometry={right} material={mat} />
    </group>
  );
}

function Kerbs({ corner }: { corner: CornerData }) {
  const geos = useMemo(() => buildKerbs(corner), [corner]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function RacingLine({ corner }: { corner: CornerData }) {
  const isOnLimit = useSim((s) => s.result.isOnLimit);
  const points = useMemo(() => buildRacingLine(corner), [corner]);
  const color = isOnLimit ? LINE_ON : LINE_OFF;
  return (
    <group>
      {/* soft halo underneath + crisp core */}
      <Line points={points} color={color} lineWidth={7} transparent opacity={0.25} depthWrite={false} />
      <Line points={points} color={color} lineWidth={2.5} />
    </group>
  );
}

const labelStyle: React.CSSProperties = {
  whiteSpace: "nowrap",
  fontFamily: "system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 0.4,
  color: "#eafcff",
  background: "rgba(8,14,20,0.78)",
  border: "1px solid rgba(127,240,255,0.55)",
  borderRadius: 6,
  padding: "3px 8px",
};

function ApexMarkers({ corner }: { corner: CornerData }) {
  const markers = useMemo(
    () =>
      corner.apexMarkers.map((m) => {
        const f = sampleTrack(corner, m.dist_m);
        // Pin on the inside edge of the corner, just outside the kerb.
        const inside = m.direction === "left" ? -(f.wLeft + 2.2) : f.wRight + 2.2;
        const pos = f.position.clone().addScaledVector(f.right, inside);
        return { ...m, pos };
      }),
    [corner]
  );
  return (
    <group>
      {markers.map((m) => (
        <group key={m.name} position={m.pos}>
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 6, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#4fd8ff" emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.9, 0.09, 8, 32]} />
            <meshStandardMaterial color="#ffffff" emissive="#4fd8ff" emissiveIntensity={2} />
          </mesh>
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.4, 1.7, 32]} />
            <meshBasicMaterial color="#4fd8ff" transparent opacity={0.75} side={THREE.DoubleSide} />
          </mesh>
          <Html position={[0, 7.4, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
            <div style={labelStyle}>
              {m.name}
              <span style={{ opacity: 0.65, fontWeight: 400 }}> &middot; R {m.radius_m.toFixed(0)} m</span>
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/** Heightfield hillside under the track, blending into the floor plane (no folding on tight corners). */
function Terrain({ corner }: { corner: CornerData }) {
  const geo = useDisposable(
    useMemo(
      () =>
        buildTerrain(corner, {
          floorY: FLOOR_Y,
          innerColor: new THREE.Color(EMBANKMENT_COLOR),
          outerColor: new THREE.Color(FLOOR_COLOR),
        }),
      [corner]
    )
  );
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

/** Elevation contour ticks across the embankment with "+N m" labels (Eau Rouge only, in practice). */
function Contours({ corner }: { corner: CornerData }) {
  const lines = useMemo(() => buildContours(corner), [corner]);
  if (lines.length === 0) return null;
  return (
    <group>
      {lines.map((c) => (
        <group key={c.level_m}>
          <Line points={c.points} color="#e6f2ff" lineWidth={1.2} transparent opacity={0.55} depthWrite={false} />
          <mesh position={[c.labelPos.x, c.labelPos.y + 2, c.labelPos.z]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 4, 6]} />
            <meshBasicMaterial color="#e6f2ff" transparent opacity={0.7} />
          </mesh>
          <Html
            position={[c.labelPos.x, c.labelPos.y + 4.6, c.labelPos.z]}
            center
            zIndexRange={[5, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div style={{ ...labelStyle, fontSize: 12, border: "1px solid rgba(230,242,255,0.45)", color: "#f2f8ff" }}>
              {c.level_m > 0 ? "+" : ""}
              {c.level_m.toFixed(0)} m
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

function Floor() {
  return (
    <mesh position={[0, FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[6000, 6000]} />
      <meshStandardMaterial color={FLOOR_COLOR} roughness={1} metalness={0} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Lighting + camera
// ---------------------------------------------------------------------------

function Lights({ corner }: { corner: CornerData }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const { center, radius } = useMemo(() => {
    const box = trackBounds(corner);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    return { center: sphere.center, radius: sphere.radius };
  }, [corner]);
  const lightDist = radius * 2.5;
  const lightPos = useMemo(() => center.clone().addScaledVector(SUN_DIR, lightDist), [center, lightDist]);

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target = targetRef.current;
    l.target.position.copy(center);
    l.target.updateMatrixWorld();
    // Tight ortho frustum around the track so the 2048 map is spent on the asphalt.
    const half = radius + 25;
    const cam = l.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = lightDist - radius - 60;
    cam.far = lightDist + radius + 60;
    cam.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [center, radius, lightDist]);

  return (
    <>
      <hemisphereLight args={["#cfe0ff", "#4a5a3a", 0.9]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        ref={light}
        castShadow={!DBG.has("noshadow")}
        color="#fff1dc"
        intensity={2.4}
        position={lightPos}
        shadow-mapSize={[3072, 3072]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.05}
      />
      <primitive object={targetRef.current} />
    </>
  );
}

const _chasePos = new THREE.Vector3();
const _chaseTarget = new THREE.Vector3();
const _chaseRight = new THREE.Vector3();

/**
 * Camera rig:
 *  - orbit mode: smoothly flies camera + orbit target to the corner's cameraHint when the corner changes
 *  - chase mode: broadcast-style chase cam following `carPose` (behind, above, slightly to the outside)
 */
function CameraRig({ corner }: { corner: CornerData }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const cameraMode = useSim((s) => s.cameraMode);
  const chasing = cameraMode === "chase";
  const goalPos = useRef(new THREE.Vector3(...corner.cameraHint.position));
  const goalTarget = useRef(new THREE.Vector3(...corner.cameraHint.target));
  const active = useRef(false);
  const lastCornerId = useRef<string | null>(null);
  const urlCam = useRef<CamGoal | null | undefined>(undefined);

  useEffect(() => {
    if (urlCam.current === undefined) urlCam.current = resolveInitialCamera(corner);
    if (lastCornerId.current === null) {
      // Snap on mount so the first frame is already framed. ?cam= wins on mount only.
      lastCornerId.current = corner.id;
      const goal = urlCam.current ?? {
        position: new THREE.Vector3(...corner.cameraHint.position),
        target: new THREE.Vector3(...corner.cameraHint.target),
      };
      goalPos.current.copy(goal.position);
      goalTarget.current.copy(goal.target);
    }
    if (lastCornerId.current !== corner.id) {
      // Corner actually changed: fly to the new hint.
      lastCornerId.current = corner.id;
      goalPos.current.set(...corner.cameraHint.position);
      goalTarget.current.set(...corner.cameraHint.target);
      active.current = true;
      return;
    }
    // Mount, or controls just became available: snap (no flight) to the current goal.
    if (!active.current) {
      camera.position.copy(goalPos.current);
      if (controls) {
        controls.target.copy(goalTarget.current);
        controls.update();
      } else {
        camera.lookAt(goalTarget.current);
      }
    }
  }, [corner, camera, controls]);

  useFrame((_, dt) => {
    if (!controls) return;
    if (chasing) {
      active.current = false; // a chase overrides any in-flight hint transition
      const outside = corner.primaryApex.direction === "right" ? -1 : 1;
      _chaseRight.crossVectors(carPose.forward, carPose.up).normalize();
      _chasePos
        .copy(carPose.position)
        .addScaledVector(carPose.forward, -14)
        .addScaledVector(carPose.up, 5)
        .addScaledVector(_chaseRight, outside * 3);
      _chaseTarget.copy(carPose.position).addScaledVector(carPose.forward, 8).addScaledVector(carPose.up, 1);
      camera.position.lerp(_chasePos, 1 - Math.exp(-dt * 4));
      controls.target.lerp(_chaseTarget, 1 - Math.exp(-dt * 8));
      controls.update();
      return;
    }
    if (!active.current) return;
    // Exponential ease: ~1 s to settle.
    const k = 1 - Math.exp(-dt * 4.5);
    camera.position.lerp(goalPos.current, k);
    controls.target.lerp(goalTarget.current, k);
    controls.update();
    if (
      camera.position.distanceToSquared(goalPos.current) < 0.01 &&
      controls.target.distanceToSquared(goalTarget.current) < 0.01
    ) {
      active.current = false;
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// Scene root
// ---------------------------------------------------------------------------

function SceneContent() {
  const corner = useSim((s) => s.corner);
  const cameraMode = useSim((s) => s.cameraMode);
  const sunPos = useMemo(() => SUN_DIR.clone().multiplyScalar(1000).toArray() as [number, number, number], []);
  return (
    <>
      <fog attach="fog" args={[HAZE, 450, 2600]} />
      <Sky sunPosition={sunPos} turbidity={6} rayleigh={1.6} mieCoefficient={0.006} mieDirectionalG={0.8} />
      <Lights corner={corner} />
      <SoftBoundary>
        <Suspense fallback={null}>
          <Environment preset="city" />
        </Suspense>
      </SoftBoundary>

      <Floor />
      <Terrain corner={corner} />
      <Contours corner={corner} />
      <TrackRibbon corner={corner} />
      <TrackEdges corner={corner} />
      <Kerbs corner={corner} />
      <RacingLine corner={corner} />
      <ApexMarkers corner={corner} />

      {!DBG.has("nocar") && (
        <Suspense fallback={null}>
          <CarOnTrack />
        </Suspense>
      )}

      {/* Target is owned by CameraRig (snap on mount, lerp on corner change) to avoid a jump. */}
      <OrbitControls
        makeDefault
        enabled={cameraMode === "orbit"}
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={6}
        maxDistance={1500}
        enableDamping
        dampingFactor={0.08}
      />
      <CameraRig corner={corner} />
    </>
  );
}

export default function Scene() {
  const initialHint = useSim.getState().corner.cameraHint;
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 45, near: 0.5, far: 5000, position: initialHint.position }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: HAZE }}
    >
      <SceneContent />
    </Canvas>
  );
}
