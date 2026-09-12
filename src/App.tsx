import React from "react";
import Scene from "./scene/Scene";
import CornerPicker from "./ui/CornerPicker";
import ControlPanel from "./ui/ControlPanel";
import Readout from "./ui/Readout";
import Transport from "./ui/Transport";
import { useSim } from "./state/store";

/**
 * App shell: full-bleed 3D scene with HUD panels floating on top.
 *
 * The overlay container is pointer-events:none so orbit controls keep
 * receiving drags/scroll everywhere except on the panels themselves.
 */

class SceneErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[Scene] failed to render:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--muted)",
            fontSize: 13,
          }}
        >
          3D scene failed to load
        </div>
      );
    }
    return this.props.children;
  }
}

function SceneFallback() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        color: "var(--muted)",
        fontSize: 13,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      Loading circuit…
    </div>
  );
}

export default function App() {
  const corner = useSim((s) => s.corner);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <SceneErrorBoundary>
          <React.Suspense fallback={<SceneFallback />}>
            <Scene />
          </React.Suspense>
        </SceneErrorBoundary>
      </div>

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* top-left: title + corner picker */}
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            maxWidth: 420,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            pointerEvents: "auto",
          }}
        >
          <div className="panel">
            <span className="label">Spa-Francorchamps</span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 6px" }}>
              {corner.displayName}
            </h1>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
              {corner.description}
            </p>
          </div>
          <CornerPicker />
        </div>

        {/* bottom-left: controls */}
        <div style={{ position: "absolute", bottom: 20, left: 20, pointerEvents: "auto" }}>
          <ControlPanel />
        </div>

        {/* top-right: results */}
        <div style={{ position: "absolute", top: 20, right: 20, pointerEvents: "auto" }}>
          <Readout />
        </div>

        {/* bottom-centre: transport */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "auto",
          }}
        >
          <Transport />
        </div>

        {/* bottom-right: hint */}
        <div
          className="hint-pill"
          style={{
            position: "absolute",
            bottom: 20,
            right: 24,
            pointerEvents: "auto",
          }}
        >
          drag to orbit · scroll to zoom · chase cam follows the car
        </div>
      </div>
    </div>
  );
}
