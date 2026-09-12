import { TIRES } from "./constants";

/**
 * Effective friction coefficient given tire wear and temperature state.
 * Wear uses a linear + quadratic falloff so grip drops gently at first and
 * then falls off a cliff late in a stint -- matches the qualitative shape of
 * real tire degradation curves without needing proprietary Pirelli data.
 */
export function effectiveMu(
  tireWearPct: number,
  tireTempState: "cold" | "optimal" | "overheated"
): number {
  const wear = Math.max(0, Math.min(100, tireWearPct));
  const wearLoss =
    TIRES.wearLinearLoss * wear + TIRES.wearQuadraticLoss * wear * wear;
  let mu = TIRES.muPeak * (1 - wearLoss);

  if (tireTempState === "cold") {
    mu *= TIRES.coldTireMultiplier;
  } else if (tireTempState === "overheated") {
    // Overheated tires lose grip too, though less severely modeled here than cold ones.
    mu *= 0.9;
  }

  return Math.max(0.2, mu);
}
