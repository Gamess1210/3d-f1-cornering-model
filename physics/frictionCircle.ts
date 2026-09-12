import { BRAKES, GRAVITY } from "./constants";

/**
 * Total grip-derived acceleration capacity (m/s^2), expressed from tire mu
 * and the normal load on the tires (car weight + downforce). This is the
 * "how many g can this car pull right now" number that both cornering and
 * braking draw from -- it's what makes downforce-vs-speed the dominant
 * factor in F1 cornering (mu * (g + downforce/mass) routinely implies 4-6g
 * in fast corners, vs a road car's ~1g).
 */
export function totalGripAccel(mu: number, downforceN: number, massKg: number): number {
  return mu * (GRAVITY + downforceN / massKg);
}

/**
 * Friction-ellipse split: given a required longitudinal (braking/accel)
 * demand, how much lateral (cornering) acceleration capacity remains.
 * Longitudinal capacity is additionally capped by BRAKES.maxDecelG, since
 * brake hardware/tire longitudinal limits can bind before the full lateral
 * grip budget would.
 */
export function remainingLateralAccel(
  totalGrip_ms2: number,
  requiredLongAccel_ms2: number
): number {
  const longMax = Math.min(totalGrip_ms2, BRAKES.maxDecelG * GRAVITY);
  const ratio = longMax > 0 ? requiredLongAccel_ms2 / longMax : 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  return totalGrip_ms2 * Math.sqrt(Math.max(0, 1 - clamped * clamped));
}

/** Max longitudinal (braking) deceleration available, independent of any lateral demand. */
export function maxBrakingAccel(totalGrip_ms2: number): number {
  return Math.min(totalGrip_ms2, BRAKES.maxDecelG * GRAVITY);
}
