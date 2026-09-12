/**
 * Low-poly F1 car built from primitives.
 *
 * Local frame: origin = ground contact point at mid-wheelbase, nose points +X,
 * up is +Y, driver's right is +Z. Roughly 5.6 m long, 2.0 m wide, 0.95 m tall.
 *
 * Per-frame animation (wheel spin, steer, roll) is done with refs inside this
 * component so the parent only needs to re-render when the *targets* change.
 * `steer` and `roll` are smoothed toward their targets.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface CarProps {
  /** Main livery colour. */
  color?: string;
  /** Contrasting accent colour (wing flaps, fin, airbox stripe). */
  accent?: string;
  /** Static wheel rotation phase, radians (added to the animated spin). */
  wheelSpin?: number;
  /** Wheel angular velocity, rad/s, animated internally. Positive = rolling forward. */
  wheelSpeed?: number;
  /** Front-wheel steering angle, radians. Positive = wheels turn to the driver's LEFT. */
  steer?: number;
  /** Body roll about the forward axis, radians. Positive = leans to the driver's RIGHT. */
  roll?: number;
  /** Render as a translucent, shadow-less ghost. */
  ghost?: boolean;
  /**
   * Optional MUTABLE live pose. When provided, `steer`, `roll` and `wheelSpeed`
   * are read from this object every frame (no React re-render needed) and the
   * corresponding props are ignored.
   */
  live?: CarLivePose;
}

export interface CarLivePose {
  steer: number;
  roll: number;
  wheelSpeed: number;
}

const TYRE_R = 0.36;
const WHEELS = [
  { x: 1.8, z: 0.8, w: 0.3, front: true },
  { x: 1.8, z: -0.8, w: 0.3, front: true },
  { x: -1.8, z: 0.78, w: 0.4, front: false },
  { x: -1.8, z: -0.78, w: 0.4, front: false },
];

export default function Car({
  color = "#d81e1e",
  accent = "#f5f5f5",
  wheelSpin = 0,
  wheelSpeed = 0,
  steer = 0,
  roll = 0,
  ghost = false,
  live,
}: CarProps) {
  const mats = useMemo(() => {
    const common = ghost ? { transparent: true, opacity: 0.25, depthWrite: false } : {};
    const body = { roughness: 0.3, metalness: 0.4, ...common };
    return {
      body: new THREE.MeshStandardMaterial({ color, ...body }),
      accent: new THREE.MeshStandardMaterial({ color: accent, ...body }),
      carbon: new THREE.MeshStandardMaterial({ color: "#1c1c1f", roughness: 0.55, metalness: 0.3, ...common }),
      tyre: new THREE.MeshStandardMaterial({ color: "#0e0e0e", roughness: 0.95, metalness: 0.0, ...common }),
      rim: new THREE.MeshStandardMaterial({ color: "#9aa0ab", roughness: 0.35, metalness: 0.85, ...common }),
      helmet: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.2, metalness: 0.2, ...common }),
    };
  }, [color, accent, ghost]);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const shadow = !ghost;

  const rollRef = useRef<THREE.Group>(null);
  const spinRefs = useRef<Array<THREE.Group | null>>([]);
  const steerRefs = useRef<Array<THREE.Group | null>>([]);
  const anim = useRef({ steer, roll, phase: 0 });

  useFrame((_, dt) => {
    const a = anim.current;
    const k = Math.min(1, dt * 8);
    const tSteer = live ? live.steer : steer;
    const tRoll = live ? live.roll : roll;
    const tSpeed = live ? live.wheelSpeed : wheelSpeed;
    a.steer += (tSteer - a.steer) * k;
    a.roll += (tRoll - a.roll) * k;
    // Rolling forward (+X) is a negative rotation about the +Z axle.
    a.phase -= tSpeed * dt;
    if (a.phase > Math.PI * 2 || a.phase < -Math.PI * 2) a.phase %= Math.PI * 2;
    if (rollRef.current) rollRef.current.rotation.x = a.roll;
    for (const g of steerRefs.current) if (g) g.rotation.y = a.steer;
    for (const g of spinRefs.current) if (g) g.rotation.z = wheelSpin + a.phase;
  });

  return (
    <group ref={rollRef}>
      {/* Floor */}
      <mesh position={[0, 0.06, 0]} material={mats.carbon} castShadow={shadow}>
        <boxGeometry args={[3.7, 0.04, 1.5]} />
      </mesh>

      {/* Chassis tub */}
      <mesh position={[0.3, 0.36, 0]} material={mats.body} castShadow={shadow}>
        <boxGeometry args={[3.4, 0.36, 0.6]} />
      </mesh>

      {/* Tapered nose (cylinder lying along +X, small end forward) */}
      <mesh position={[2.15, 0.4, 0]} rotation={[0, 0, -Math.PI / 2]} material={mats.body} castShadow={shadow}>
        <cylinderGeometry args={[0.07, 0.26, 1.7, 10]} />
      </mesh>

      {/* Front wing: main plane, flap, endplates */}
      <mesh position={[2.75, 0.12, 0]} material={mats.carbon} castShadow={shadow}>
        <boxGeometry args={[0.5, 0.05, 1.95]} />
      </mesh>
      <mesh position={[2.5, 0.2, 0]} rotation={[0, 0, 0.25]} material={mats.accent} castShadow={shadow}>
        <boxGeometry args={[0.3, 0.04, 1.8]} />
      </mesh>
      <mesh position={[2.72, 0.2, 0.98]} material={mats.body} castShadow={shadow}>
        <boxGeometry args={[0.6, 0.26, 0.03]} />
      </mesh>
      <mesh position={[2.72, 0.2, -0.98]} material={mats.body} castShadow={shadow}>
        <boxGeometry args={[0.6, 0.26, 0.03]} />
      </mesh>

      {/* Sidepods */}
      <mesh position={[-0.3, 0.38, 0.56]} material={mats.body} castShadow={shadow}>
        <boxGeometry args={[1.7, 0.46, 0.5]} />
      </mesh>
      <mesh position={[-0.3, 0.38, -0.56]} material={mats.body} castShadow={shadow}>
        <boxGeometry args={[1.7, 0.46, 0.5]} />
      </mesh>
      {/* Sidepod inlets (dark) */}
      <mesh position={[0.56, 0.42, 0.56]} material={mats.carbon} castShadow={shadow}>
        <boxGeometry args={[0.04, 0.3, 0.42]} />
      </mesh>
      <mesh position={[0.56, 0.42, -0.56]} material={mats.carbon} castShadow={shadow}>
        <boxGeometry args={[0.04, 0.3, 0.42]} />
      </mesh>

      {/* Cockpit surround / engine cover */}
      <mesh position={[-0.7, 0.64, 0]} material={mats.body} castShadow={shadow}>
        <boxGeometry args={[1.9, 0.26, 0.5]} />
      </mesh>
      {/* Airbox */}
      <mesh position={[-0.35, 0.86, 0]} material={mats.accent} castShadow={shadow}>
        <boxGeometry args={[0.7, 0.22, 0.34]} />
      </mesh>
      {/* Shark fin */}
      <mesh position={[-1.55, 0.72, 0]} material={mats.accent} castShadow={shadow}>
        <boxGeometry args={[1.1, 0.3, 0.03]} />
      </mesh>

      {/* Driver helmet */}
      <mesh position={[0.45, 0.74, 0]} material={mats.helmet} castShadow={shadow}>
        <sphereGeometry args={[0.15, 12, 10]} />
      </mesh>

      {/* Halo: tube ring + front pylon */}
      <mesh position={[0.45, 0.88, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.carbon} castShadow={shadow}>
        <torusGeometry args={[0.36, 0.028, 8, 20]} />
      </mesh>
      <mesh position={[0.8, 0.72, 0]} rotation={[0, 0, 0.3]} material={mats.carbon} castShadow={shadow}>
        <cylinderGeometry args={[0.025, 0.025, 0.36, 8]} />
      </mesh>

      {/* Rear crash structure / diffuser */}
      <mesh position={[-2.45, 0.2, 0]} material={mats.carbon} castShadow={shadow}>
        <boxGeometry args={[0.7, 0.22, 1.05]} />
      </mesh>

      {/* Rear wing: main plane, lower beam, endplates, pylon */}
      <mesh position={[-2.55, 0.88, 0]} rotation={[0, 0, 0.12]} material={mats.body} castShadow={shadow}>
        <boxGeometry args={[0.36, 0.05, 1.6]} />
      </mesh>
      <mesh position={[-2.5, 0.58, 0]} material={mats.accent} castShadow={shadow}>
        <boxGeometry args={[0.26, 0.04, 1.2]} />
      </mesh>
      <mesh position={[-2.5, 0.72, 0.8]} material={mats.body} castShadow={shadow}>
        <boxGeometry args={[0.62, 0.5, 0.03]} />
      </mesh>
      <mesh position={[-2.5, 0.72, -0.8]} material={mats.body} castShadow={shadow}>
        <boxGeometry args={[0.62, 0.5, 0.03]} />
      </mesh>
      <mesh position={[-2.35, 0.6, 0]} material={mats.carbon} castShadow={shadow}>
        <boxGeometry args={[0.1, 0.5, 0.06]} />
      </mesh>

      {/* Wheels + one suspension arm each */}
      {WHEELS.map((w, i) => {
        const side = Math.sign(w.z);
        const wheel = (
          <group
            ref={(g) => {
              spinRefs.current[i] = g;
            }}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.tyre} castShadow={shadow}>
              <cylinderGeometry args={[TYRE_R, TYRE_R, w.w, 24]} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.rim} castShadow={shadow}>
              <cylinderGeometry args={[0.22, 0.22, w.w + 0.01, 16]} />
            </mesh>
          </group>
        );
        return (
          <group key={i}>
            <mesh position={[w.x, 0.38, side * 0.5]} material={mats.carbon} castShadow={shadow}>
              <boxGeometry args={[0.07, 0.03, 0.55]} />
            </mesh>
            {w.front ? (
              <group
                position={[w.x, TYRE_R, w.z]}
                ref={(g) => {
                  steerRefs.current[i] = g;
                }}
              >
                {wheel}
              </group>
            ) : (
              <group position={[w.x, TYRE_R, w.z]}>{wheel}</group>
            )}
          </group>
        );
      })}
    </group>
  );
}
