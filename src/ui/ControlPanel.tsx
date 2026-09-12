import { useSim } from "../state/store";
import Slider from "./Slider";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Driver / setup inputs, wired straight into the zustand store. */
export default function ControlPanel() {
  const params = useSim((s) => s.params);
  const corner = useSim((s) => s.corner);
  const setParam = useSim((s) => s.setParam);
  const setWind = useSim((s) => s.setWind);
  const resetParams = useSim((s) => s.resetParams);

  return (
    <div className="panel" style={{ width: 340 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <span className="label">Setup &amp; driver inputs</span>
        <button className="text-button" onClick={resetParams}>
          Reset
        </button>
      </div>

      <Slider
        label="Front wing"
        value={params.frontWing}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        onChange={(v) => setParam("frontWing", v)}
      />
      <Slider
        label="Rear wing"
        value={params.rearWing}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        onChange={(v) => setParam("rearWing", v)}
      />
      <Slider
        label="Braking point before apex"
        value={params.brakingPointBeforeApex_m}
        min={corner.brakingRange.min}
        max={corner.brakingRange.max}
        step={1}
        format={(v) => `${v.toFixed(0)} m`}
        onChange={(v) => setParam("brakingPointBeforeApex_m", v)}
      />
      <Slider
        label="Wind speed"
        value={params.wind.speed_ms}
        min={0}
        max={20}
        step={0.1}
        format={(v) => `${v.toFixed(1)} m/s`}
        onChange={(v) => setWind({ speed_ms: v })}
      />
      <Slider
        label="Wind heading (from)"
        value={params.wind.headingDeg}
        min={0}
        max={360}
        step={1}
        format={(v) => `${v.toFixed(0)}°`}
        adornment={
          <span
            className="compass"
            style={{
              transform: `rotate(${params.wind.headingDeg}deg)`,
              marginLeft: 6,
              opacity: params.wind.speed_ms > 0 ? 1 : 0.35,
            }}
          >
            ➤
          </span>
        }
        onChange={(v) => setWind({ headingDeg: v })}
      />

      <hr className="divider" />

      <details>
        <summary>Advanced (stretch)</summary>
        <div>
          <Slider
            label="Tire wear"
            value={params.tireWearPct}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v.toFixed(0)}%`}
            onChange={(v) => setParam("tireWearPct", v)}
          />
          <Slider
            label="Racing line radius"
            value={params.lineRadiusMultiplier}
            min={0.85}
            max={1.15}
            step={0.01}
            format={(v) => `${v.toFixed(2)}×`}
            onChange={(v) => setParam("lineRadiusMultiplier", v)}
          />
        </div>
      </details>
    </div>
  );
}
