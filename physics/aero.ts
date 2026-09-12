import { AERO, AIR_DENSITY_SEA_LEVEL, FRONTAL_AREA_M2 } from "./constants";
import type { WindState, WingSetting } from "./types";

/**
 * Resolves the car's velocity vector and the wind vector into a relative
 * airspeed (m/s) -- this is what actually drives aero force, not ground speed.
 *
 * @param carSpeed_ms   car speed over ground, m/s
 * @param carHeadingDeg direction of travel, degrees (0 = +x axis)
 * @param wind          wind speed + the compass heading it is blowing FROM
 */
export function relativeAirspeed(
  carSpeed_ms: number,
  carHeadingDeg: number,
  wind: WindState
): number {
  const carRad = (carHeadingDeg * Math.PI) / 180;
  const carVx = carSpeed_ms * Math.cos(carRad);
  const carVy = carSpeed_ms * Math.sin(carRad);

  // Wind "heading" is where it blows FROM, so the wind's velocity vector
  // (the direction air is actually moving) is 180 degrees from that heading.
  const windRad = ((wind.headingDeg + 180) * Math.PI) / 180;
  const windVx = wind.speed_ms * Math.cos(windRad);
  const windVy = wind.speed_ms * Math.sin(windRad);

  // Airspeed relative to the car = car velocity - air velocity (air velocity
  // subtracted because a tailwind reduces the air flowing over the car).
  const relVx = carVx - windVx;
  const relVy = carVy - windVy;

  return Math.hypot(relVx, relVy);
}

export function liftCoefficient(frontWing: WingSetting, rearWing: WingSetting): number {
  return AERO.clBase + AERO.clFrontMax * frontWing + AERO.clRearMax * rearWing;
}

export function dragCoefficient(frontWing: WingSetting, rearWing: WingSetting): number {
  return AERO.cdBase + AERO.cdFrontMax * frontWing + AERO.cdRearMax * rearWing;
}

/** Front-axle share of total downforce (0..1), given wing settings. */
export function aeroBalanceFront(frontWing: WingSetting, rearWing: WingSetting): number {
  const frontCl = AERO.clBase * 0.5 + AERO.clFrontMax * frontWing;
  const totalCl = liftCoefficient(frontWing, rearWing);
  return frontCl / totalCl;
}

export function downforceNewtons(
  airspeed_ms: number,
  frontWing: WingSetting,
  rearWing: WingSetting,
  airDensity: number = AIR_DENSITY_SEA_LEVEL
): number {
  const cl = liftCoefficient(frontWing, rearWing);
  return 0.5 * airDensity * airspeed_ms ** 2 * FRONTAL_AREA_M2 * cl;
}

export function dragNewtons(
  airspeed_ms: number,
  frontWing: WingSetting,
  rearWing: WingSetting,
  airDensity: number = AIR_DENSITY_SEA_LEVEL
): number {
  const cd = dragCoefficient(frontWing, rearWing);
  return 0.5 * airDensity * airspeed_ms ** 2 * FRONTAL_AREA_M2 * cd;
}
