import { CAR_MASS_KG, GRAVITY } from "./constants";
import { downforceNewtons, dragNewtons, relativeAirspeed } from "./aero";
import { effectiveMu } from "./tires";
import { totalGripAccel } from "./frictionCircle";
import { simulateBrakingZone } from "./brakeModel";
import type { CorneringParams, CorneringResult, CornerPhysicsInput } from "./types";

/**
 * Solves for the maximum steady-state speed the car can carry through a
 * corner's apex, given banking, downforce (which depends on speed, hence
 * the fixed-point iteration), and tire grip.
 *
 * Physical model per iteration:
 *   required centripetal force = m*v^2/r
 *   available = m*g*sin(bank)                      <- banking "does some of the work for free"
 *             + mu*(m*g*cos(bank) + downforce(v))   <- friction on the loaded contact patch
 *
 * Solving m*v^2/r = that sum gives v^2 directly for a given downforce guess;
 * we iterate because downforce itself depends on v (via relative airspeed,
 * which also folds in wind).
 */
function solveApexSpeed(
  corner: CornerPhysicsInput,
  params: CorneringParams,
  mu: number
): { speed_ms: number; downforceN: number; dragN: number } {
  const radius = Math.max(3, corner.radius_m * params.lineRadiusMultiplier);
  const bankRad = (corner.bankingDeg * Math.PI) / 180;

  // Initial guess: flat-track, no-downforce estimate.
  let v = Math.sqrt(radius * mu * GRAVITY);
  let downforce = 0;
  let drag = 0;

  for (let i = 0; i < 25; i++) {
    const airspeed = relativeAirspeed(v, params.carHeadingDeg, params.wind);
    downforce = downforceNewtons(airspeed, params.frontWing, params.rearWing);
    drag = dragNewtons(airspeed, params.frontWing, params.rearWing);

    const availableLateralForce =
      CAR_MASS_KG * GRAVITY * Math.sin(bankRad) +
      mu * (CAR_MASS_KG * GRAVITY * Math.cos(bankRad) + downforce);

    const vSq = (availableLateralForce * radius) / CAR_MASS_KG;
    const vNext = Math.sqrt(Math.max(0, vSq));

    if (Math.abs(vNext - v) < 1e-4) {
      v = vNext;
      break;
    }
    v = vNext;
  }

  return { speed_ms: v, downforceN: downforce, dragN: drag };
}

export function computeCornering(
  corner: CornerPhysicsInput,
  params: CorneringParams
): CorneringResult {
  const mu = effectiveMu(params.tireWearPct, params.tireTempState);
  const { speed_ms: apexSpeed_ms, downforceN, dragN } = solveApexSpeed(
    corner,
    params,
    mu
  );

  const brakeZone = simulateBrakingZone(params);
  const achievedApexSpeed_ms = brakeZone.speedAtApex_ms;

  const isOnLimit = achievedApexSpeed_ms <= apexSpeed_ms + 1e-6;
  const speedMarginKmh = (achievedApexSpeed_ms - apexSpeed_ms) * 3.6;

  const grip = totalGripAccel(mu, downforceN, CAR_MASS_KG);
  const effectiveRadius = corner.radius_m * params.lineRadiusMultiplier;
  const lateralAccelG =
    (achievedApexSpeed_ms * achievedApexSpeed_ms) / effectiveRadius / GRAVITY;

  const distanceProfile = brakeZone.samples.map((s) => ({
    dist_m: -s.distToApex_m, // negative = before apex, 0 = at apex, matches a left-to-right chart
    speed_ms: s.speed_ms,
    lateralG: 0,
    longG: s.longG,
  }));
  // Mark the final (apex) sample's lateral G using the actual achieved speed/radius.
  if (distanceProfile.length > 0) {
    distanceProfile[distanceProfile.length - 1].lateralG = lateralAccelG;
  }

  return {
    apexSpeed_ms,
    achievedApexSpeed_ms,
    isOnLimit,
    speedMarginKmh,
    effectiveRadius_m: effectiveRadius,
    downforceN,
    dragN,
    effectiveMu: mu,
    lateralAccelG,
    requiredDecelG: grip / GRAVITY,
    distanceProfile,
  };
}
