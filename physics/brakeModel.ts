import { CAR_MASS_KG } from "./constants";
import { downforceNewtons, dragNewtons, relativeAirspeed } from "./aero";
import { effectiveMu } from "./tires";
import { maxBrakingAccel, totalGripAccel } from "./frictionCircle";
import type { CorneringParams } from "./types";

export interface BrakeZoneSample {
  /** Distance to the apex (m). Positive = still before the apex. 0 = at the apex. */
  distToApex_m: number;
  speed_ms: number;
  longG: number;
}

export interface BrakeZoneResult {
  /** Speed (m/s) the car actually reaches at the apex, given the chosen braking point. */
  speedAtApex_ms: number;
  samples: BrakeZoneSample[];
}

/**
 * Integrates the car's speed from the driver's chosen braking point down to
 * the corner apex, assuming the driver brakes at the maximum grip-limited
 * deceleration available at each instant (an idealized "on the limit"
 * driver -- real drivers leave a margin, but this gives the ceiling the UI
 * can compare an actual chosen brake point/approach speed against).
 *
 * Uses small distance-step (Euler) integration because both aero drag and
 * the grip-limited deceleration change with speed.
 */
export function simulateBrakingZone(
  params: CorneringParams,
  stepSize_m = 2
): BrakeZoneResult {
  const mu = effectiveMu(params.tireWearPct, params.tireTempState);
  const distance = Math.max(0, params.brakingPointBeforeApex_m);

  let v = params.approachSpeed_ms;
  let remaining = distance;
  const samples: BrakeZoneSample[] = [
    { distToApex_m: distance, speed_ms: v, longG: 0 },
  ];

  while (remaining > 0) {
    const ds = Math.min(stepSize_m, remaining);

    const airspeed = relativeAirspeed(v, params.carHeadingDeg, params.wind);
    const downforce = downforceNewtons(airspeed, params.frontWing, params.rearWing);
    const drag = dragNewtons(airspeed, params.frontWing, params.rearWing);

    const grip = totalGripAccel(mu, downforce, CAR_MASS_KG);
    const brakingDecel = maxBrakingAccel(grip); // m/s^2, grip-limited
    const dragDecel = drag / CAR_MASS_KG; // aero drag helps slow the car too
    const totalDecel = brakingDecel + dragDecel;

    // v_new^2 = v^2 - 2*a*ds, guarding against going negative from a coarse final step.
    const vNextSq = Math.max(0, v * v - 2 * totalDecel * ds);
    const vNext = Math.sqrt(vNextSq);

    remaining -= ds;
    v = vNext;

    samples.push({
      distToApex_m: remaining,
      speed_ms: v,
      longG: totalDecel / 9.81,
    });
  }

  return { speedAtApex_ms: v, samples };
}
