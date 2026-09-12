import { useSim } from "../state/store";

const RATES = [0.25, 0.5, 1] as const;
const CAMERAS = ["orbit", "chase"] as const;

/** Compact bottom-centre transport bar: play/pause, restart, speed, camera. */
export default function Transport() {
  const playing = useSim((s) => s.playing);
  const playbackRate = useSim((s) => s.playbackRate);
  const cameraMode = useSim((s) => s.cameraMode);
  const setPlaying = useSim((s) => s.setPlaying);
  const setPlaybackRate = useSim((s) => s.setPlaybackRate);
  const setCameraMode = useSim((s) => s.setCameraMode);
  const restartLap = useSim((s) => s.restartLap);

  return (
    <div className="panel transport">
      <button
        className={`icon-button${playing ? " active" : ""}`}
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause" : "Play"}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <button
        className="icon-button"
        aria-label="Restart lap"
        title="Restart lap"
        onClick={restartLap}
      >
        ↺
      </button>

      <span className="transport-sep" />

      <span className="label">Speed</span>
      <div className="segmented compact">
        {RATES.map((r) => (
          <button
            key={r}
            className={Math.abs(playbackRate - r) < 0.001 ? "active" : ""}
            aria-pressed={Math.abs(playbackRate - r) < 0.001}
            onClick={() => setPlaybackRate(r)}
          >
            {r}×
          </button>
        ))}
      </div>

      <span className="transport-sep" />

      <span className="label">Camera</span>
      <div className="segmented compact">
        {CAMERAS.map((m) => (
          <button
            key={m}
            className={cameraMode === m ? "active" : ""}
            aria-pressed={cameraMode === m}
            onClick={() => setCameraMode(m)}
          >
            {m === "orbit" ? "Orbit" : "Chase"}
          </button>
        ))}
      </div>
    </div>
  );
}
