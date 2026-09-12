/**
 * Mutable, per-frame car pose shared between CarOnTrack (writer) and the
 * camera rig / HUD (readers) WITHOUT going through React state, so nothing
 * re-renders 60x a second. Written in CarOnTrack's useFrame.
 */
import * as THREE from "three";

export const carPose = {
  /** World-space position of the car origin (ground contact, mid-wheelbase). */
  position: new THREE.Vector3(),
  /** Unit direction of travel (world). */
  forward: new THREE.Vector3(1, 0, 0),
  /** Surface up at the car (world). */
  up: new THREE.Vector3(0, 1, 0),
  /** Arc-length distance along the segment, metres. */
  dist_m: 0,
  /** Current ground speed, m/s. */
  speed_ms: 0,
  /** True once the car has passed the apex and is over the limit (running wide). */
  offTrack: false,
};
