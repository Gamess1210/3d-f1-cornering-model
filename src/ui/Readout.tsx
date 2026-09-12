import { useSim } from "../state/store";
import SpeedTrace from "./SpeedTrace";

function BigNumber({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <span className="label">{label}</span>
      <div className="big-number">
        {value.toFixed(1)}
        <span className="unit">km/h</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

/** Results HUD: big speeds, limit status, key forces and the speed trace. */
export default function Readout() {
  const result = useSim((s) => s.result);
  const corner = useSim((s) => s.corner);

  const achievedKmh = result.achievedApexSpeed_ms * 3.6;
  const limitKmh = result.apexSpeed_ms * 3.6;

  const ratio = limitKmh > 0 ? achievedKmh / limitKmh : 0;
  const fill = Math.min(ratio, 1.3) / 1.3;

  return (
    <div className="panel" style={{ width: 360 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <BigNumber label="Achieved apex speed" value={achievedKmh} />
        <BigNumber label="Grip limit" value={limitKmh} />
      </div>

      <div className="bar" style={{ marginBottom: 10 }}>
        <div
          className="bar-fill"
          style={{
            width: `${(fill * 100).toFixed(1)}%`,
            background: result.isOnLimit ? "var(--ok)" : "var(--bad)",
          }}
        />
      </div>

      <div className={`badge ${result.isOnLimit ? "ok" : "bad"}`}>
        {result.isOnLimit
          ? "On the limit · car holds the line"
          : `Over by ${result.speedMarginKmh.toFixed(1)} km/h · running wide`}
      </div>

      <hr className="divider" />

      <div className="stats">
        <Stat label="Downforce" value={`${(result.downforceN / 1000).toFixed(1)} kN`} />
        <Stat label="Drag" value={`${(result.dragN / 1000).toFixed(1)} kN`} />
        <Stat label="Lateral" value={`${result.lateralAccelG.toFixed(2)} g`} />
        <Stat label="Real-world ref" value={`${corner.realWorldApexSpeed_kmh} km/h`} />
        <Stat label="Radius" value={`${corner.primaryApex.radius_m.toFixed(0)} m`} />
        <Stat label="Elevation" value={`${corner.primaryApex.elevationChange_m.toFixed(1)} m`} />
      </div>

      <hr className="divider" />

      <span className="label">Speed trace into the apex</span>
      <SpeedTrace
        profile={result.distanceProfile}
        limitKmh={limitKmh}
        isOnLimit={result.isOnLimit}
      />
    </div>
  );
}
