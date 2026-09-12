import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { computeCornering } from "../cornerModel";
import type { CorneringParams } from "../types";

const dataDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "spa"
);

function loadCorner(file: string) {
  return JSON.parse(readFileSync(path.join(dataDir, file), "utf-8"));
}

const baseParams: CorneringParams = {
  frontWing: 0.6,
  rearWing: 0.6,
  tireWearPct: 20,
  tireTempState: "optimal",
  wind: { speed_ms: 0, headingDeg: 0 },
  carHeadingDeg: 0,
  brakingPointBeforeApex_m: 120,
  approachSpeed_ms: 90,
  lineRadiusMultiplier: 1.0,
};

describe("computeCornering calibration sanity checks", () => {
  it("La Source hairpin lands near the real-world ~80 km/h reference", () => {
    const laSource = loadCorner("la-source.json");
    const result = computeCornering(laSource.primaryApex, {
      ...baseParams,
      approachSpeed_ms: 90,
      brakingPointBeforeApex_m: 130,
    });

    const apexKmh = result.apexSpeed_ms * 3.6;
    // Wide band -- this is a sanity check on order-of-magnitude realism,
    // not a precision calibration assertion. Tighten once FastF1 telemetry
    // calibration data is available (see data/telemetry/).
    expect(apexKmh).toBeGreaterThan(50);
    expect(apexKmh).toBeLessThan(120);
  });

  it("Eau Rouge/Raidillon lands near the real-world ~300 km/h reference", () => {
    const eauRouge = loadCorner("eau-rouge-raidillon.json");
    const result = computeCornering(eauRouge.primaryApex, {
      ...baseParams,
      approachSpeed_ms: 90, // braking zone irrelevant here -- this corner is taken flat out
      brakingPointBeforeApex_m: 0,
    });

    const apexKmh = result.apexSpeed_ms * 3.6;
    expect(apexKmh).toBeGreaterThan(220);
    expect(apexKmh).toBeLessThan(340);
  });

  it("more front+rear wing (more downforce) increases apex speed at a given corner", () => {
    const eauRouge = loadCorner("eau-rouge-raidillon.json");
    const low = computeCornering(eauRouge.primaryApex, {
      ...baseParams,
      frontWing: 0.1,
      rearWing: 0.1,
    });
    const high = computeCornering(eauRouge.primaryApex, {
      ...baseParams,
      frontWing: 0.9,
      rearWing: 0.9,
    });

    expect(high.apexSpeed_ms).toBeGreaterThan(low.apexSpeed_ms);
  });

  it("more tire wear reduces apex speed at a given corner", () => {
    const laSource = loadCorner("la-source.json");
    const fresh = computeCornering(laSource.primaryApex, {
      ...baseParams,
      tireWearPct: 0,
    });
    const worn = computeCornering(laSource.primaryApex, {
      ...baseParams,
      tireWearPct: 80,
    });

    expect(worn.apexSpeed_ms).toBeLessThan(fresh.apexSpeed_ms);
  });

  it("braking too late causes the achieved apex speed to exceed the physical limit", () => {
    const laSource = loadCorner("la-source.json");
    const lateBrake = computeCornering(laSource.primaryApex, {
      ...baseParams,
      approachSpeed_ms: 90,
      brakingPointBeforeApex_m: 10, // way too short a braking zone
    });

    expect(lateBrake.isOnLimit).toBe(false);
    expect(lateBrake.speedMarginKmh).toBeGreaterThan(0);
  });
});
