/**
 * Global app state (zustand). SHARED CONTRACT between UI, scene and car.
 *
 * - `cornerId` / `corner`  : which of the two Spa corners is selected
 * - `params`               : the driver/setup inputs fed to computeCornering()
 * - `result`               : derived physics output, recomputed on every change
 *
 * Usage:
 *   const result = useSim((s) => s.result);
 *   const setParam = useSim((s) => s.setParam);
 *   setParam("frontWing", 0.8);
 */

import { create } from "zustand";
import { computeCornering } from "../../physics/cornerModel";
import type { CorneringParams, CorneringResult, WindState } from "../../physics/types";
import { CORNERS, headingDegAt, type CornerData, type CornerId } from "../track/cornerData";

export const BASE_PARAMS: Omit<CorneringParams, "approachSpeed_ms" | "brakingPointBeforeApex_m"> = {
  frontWing: 0.6,
  rearWing: 0.6,
  tireWearPct: 20,
  tireTempState: "optimal",
  wind: { speed_ms: 0, headingDeg: 0 },
  carHeadingDeg: 0,
  lineRadiusMultiplier: 1.0,
};

function paramsForCorner(corner: CornerData, keep?: Partial<CorneringParams>): CorneringParams {
  return {
    ...BASE_PARAMS,
    ...keep,
    ...corner.defaultParams,
    // Car heading at the apex drives the wind-relative airspeed, so derive it from the geometry.
    carHeadingDeg: headingDegAt(corner.centerline, corner.apexDist_m),
  };
}

export interface SimState {
  cornerId: CornerId;
  corner: CornerData;
  params: CorneringParams;
  result: CorneringResult;

  setCorner: (id: CornerId) => void;
  setParam: <K extends keyof CorneringParams>(key: K, value: CorneringParams[K]) => void;
  setWind: (patch: Partial<WindState>) => void;
  resetParams: () => void;

  /** Car animation transport. The car loops through the corner segment while `playing`. */
  playing: boolean;
  /** 1 = real time (300 km/h really looks like 300 km/h), 0.25 = quarter speed. */
  playbackRate: number;
  /** Camera mode: free orbit vs. following the moving car. */
  cameraMode: "orbit" | "chase";
  setPlaying: (v: boolean) => void;
  setPlaybackRate: (v: number) => void;
  setCameraMode: (m: "orbit" | "chase") => void;
  /** Bumped by the UI to ask the car to restart its lap from the segment start. */
  lapResetToken: number;
  restartLap: () => void;
}

/** Initial corner: `?corner=eau-rouge-raidillon` in the URL overrides the default (handy for demos/screenshots). */
function initialCornerId(): CornerId {
  if (typeof window === "undefined") return "la-source";
  const q = new URLSearchParams(window.location.search).get("corner");
  return q && q in CORNERS ? (q as CornerId) : "la-source";
}

/** Optional URL overrides for headless screenshots / demo deep-links: ?bp=60&wing=0.3&wind=15&windDir=180 */
function urlParamOverrides(): Partial<CorneringParams> {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const num = (k: string) => (q.has(k) && !Number.isNaN(Number(q.get(k))) ? Number(q.get(k)) : undefined);
  const out: Partial<CorneringParams> = {};
  const bp = num("bp");
  const wing = num("wing");
  const wind = num("wind");
  const windDir = num("windDir");
  if (bp !== undefined) out.brakingPointBeforeApex_m = bp;
  if (wing !== undefined) (out.frontWing = wing), (out.rearWing = wing);
  if (wind !== undefined || windDir !== undefined)
    out.wind = { speed_ms: wind ?? 0, headingDeg: windDir ?? 0 };
  return out;
}

const initialCorner = CORNERS[initialCornerId()];
const initialParams: CorneringParams = { ...paramsForCorner(initialCorner), ...urlParamOverrides() };

export const useSim = create<SimState>((set, get) => ({
  cornerId: initialCorner.id,
  corner: initialCorner,
  params: initialParams,
  result: computeCornering(initialCorner.primaryApex, initialParams),

  setCorner: (id) => {
    const corner = CORNERS[id];
    const prev = get().params;
    // Keep the user's setup (wings, wind, tires) but reset the corner-specific driver inputs.
    const params = paramsForCorner(corner, {
      frontWing: prev.frontWing,
      rearWing: prev.rearWing,
      wind: prev.wind,
      tireWearPct: prev.tireWearPct,
      tireTempState: prev.tireTempState,
      lineRadiusMultiplier: prev.lineRadiusMultiplier,
    });
    set({ cornerId: id, corner, params, result: computeCornering(corner.primaryApex, params) });
  },

  setParam: (key, value) => {
    const { corner, params: prev } = get();
    const params = { ...prev, [key]: value };
    set({ params, result: computeCornering(corner.primaryApex, params) });
  },

  setWind: (patch) => {
    const { corner, params: prev } = get();
    const params = { ...prev, wind: { ...prev.wind, ...patch } };
    set({ params, result: computeCornering(corner.primaryApex, params) });
  },

  resetParams: () => {
    const { corner } = get();
    const params = paramsForCorner(corner);
    set({ params, result: computeCornering(corner.primaryApex, params) });
  },

  playing: true,
  playbackRate: 0.5,
  cameraMode: (typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("cam") === "chase"
    ? "chase"
    : "orbit") as "orbit" | "chase",
  setPlaying: (v) => set({ playing: v }),
  setPlaybackRate: (v) => set({ playbackRate: Math.min(2, Math.max(0.1, v)) }),
  setCameraMode: (m) => set({ cameraMode: m }),
  lapResetToken: 0,
  restartLap: () => set((s) => ({ lapResetToken: s.lapResetToken + 1 })),
}));
