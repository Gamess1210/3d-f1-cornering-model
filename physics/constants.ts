/**
 * Physical + car constants for the cornering-speed model.
 *
 * Values are representative of a modern (2022+ regulation) F1 car, assembled
 * from publicly reported figures (FIA technical regulations, team/press
 * technical briefings). They are reasonable engineering estimates, NOT
 * official team data (real aero maps and tire models are proprietary).
 * Treat every constant here as tunable -- the `calibration.json` files in
 * data/telemetry/ (built from real FastF1 corner speeds) are what you tune
 * these against so the model's output tracks reality.
 */

export const GRAVITY = 9.81; // m/s^2
export const AIR_DENSITY_SEA_LEVEL = 1.225; // kg/m^3 at 15C

/** 2022+ regulation minimum car weight (kg), including driver, no fuel. */
export const CAR_MASS_KG = 798;

/** Approximate frontal area (m^2) used in aero force calcs. */
export const FRONTAL_AREA_M2 = 1.5;

/**
 * Baseline aero coefficients at a "reference" mid wing setting (0..1 slider
 * range on each wing, where 1 = maximum downforce / maximum drag).
 * Cl and Cd here already fold in frontal area normalization elsewhere is NOT
 * applied twice -- these are used directly against 0.5 * rho * v^2 * A.
 */
export const AERO = {
  // Downforce coefficient contribution from front wing at full deflection (0..1 slider).
  clFrontMax: 1.1,
  // Downforce coefficient contribution from rear wing at full deflection (0..1 slider).
  clRearMax: 1.9,
  // Drag coefficient contribution from front wing at full deflection.
  cdFrontMax: 0.25,
  // Drag coefficient contribution from rear wing at full deflection.
  cdRearMax: 0.55,
  // Fixed (wing-independent) floor/diffuser/body downforce and drag -- present even at 0 wing.
  clBase: 1.2,
  cdBase: 0.55,
} as const;

/** Nominal aero balance target (fraction of total downforce on the front axle). */
export const NOMINAL_AERO_BALANCE_FRONT = 0.40;

export const TIRES = {
  // Peak (fresh-tire, optimal temperature) combined-axis friction coefficient.
  // NOT a literal road-tire mu -- F1 slicks + aero-loaded contact patches
  // routinely produce effective mu well above 1 in lateral g terms.
  muPeak: 1.9,
  // Fractional grip loss per % of tire wear (linear term).
  wearLinearLoss: 0.0035,
  // Fractional grip loss per %^2 of tire wear (quadratic term -- cliff behavior late in a stint).
  wearQuadraticLoss: 0.00006,
  // Grip multiplier when tire is well below operating temperature ("cold").
  coldTireMultiplier: 0.85,
} as const;

export const BRAKES = {
  // Max longitudinal deceleration achievable at the grip limit, expressed as g.
  // (Real F1 braking can exceed 5g instantaneously; sustained-average figures
  // used here are a bit more conservative to represent a controllable braking phase.)
  maxDecelG: 4.5,
} as const;

export const AERODYNAMIC_DRAG_CONSTANTS = {
  // Rolling resistance coefficient (small vs aero drag at speed, included for completeness).
  rollingResistanceCoeff: 0.015,
};
