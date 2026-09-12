import type { CorneringResult } from "../../physics/types";

const W = 300;
const H = 90;
const PAD_L = 30;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 16;

/**
 * Compact speed-vs-distance trace for the braking zone.
 * x = distance to apex (most negative -> 0), y = speed in km/h.
 * Pure inline SVG, no chart library.
 */
export default function SpeedTrace({
  profile,
  limitKmh,
  isOnLimit,
}: {
  profile: CorneringResult["distanceProfile"];
  limitKmh: number;
  isOnLimit: boolean;
}) {
  const okColor = "var(--ok)";
  const badColor = "var(--bad)";
  const endColor = isOnLimit ? okColor : badColor;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const axis = (
    <>
      <line
        x1={PAD_L}
        y1={H - PAD_B}
        x2={W - PAD_R}
        y2={H - PAD_B}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
      <line
        x1={PAD_L}
        y1={PAD_T}
        x2={PAD_L}
        y2={H - PAD_B}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
    </>
  );

  if (!profile || profile.length <= 1) {
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Speed trace">
        {axis}
        <circle cx={W - PAD_R - 2} cy={PAD_T + innerH / 2} r={3.5} fill={endColor} />
        <text
          x={PAD_L + innerW / 2}
          y={PAD_T + innerH / 2 - 8}
          fill="var(--muted)"
          fontSize={10}
          textAnchor="middle"
        >
          no braking zone
        </text>
      </svg>
    );
  }

  const dists = profile.map((p) => p.dist_m);
  const speeds = profile.map((p) => p.speed_ms * 3.6);

  const dMin = Math.min(...dists);
  const dMax = Math.max(...dists);
  const dSpan = dMax - dMin || 1;

  const sLo = Math.min(...speeds, limitKmh) * 0.9;
  const sHi = Math.max(...speeds, limitKmh) * 1.05;
  const sSpan = sHi - sLo || 1;

  const px = (d: number) => PAD_L + ((d - dMin) / dSpan) * innerW;
  const py = (kmh: number) => PAD_T + innerH - ((kmh - sLo) / sSpan) * innerH;

  const path = profile
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.dist_m).toFixed(1)},${py(p.speed_ms * 3.6).toFixed(1)}`)
    .join(" ");

  const last = profile[profile.length - 1];
  const limitY = py(limitKmh);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Speed trace">
      {axis}

      {/* grip limit */}
      <line
        x1={PAD_L}
        y1={limitY}
        x2={W - PAD_R}
        y2={limitY}
        stroke="var(--warn)"
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.8}
      />
      <text x={2} y={limitY + 3} fill="var(--warn)" fontSize={9}>
        {limitKmh.toFixed(0)}
      </text>

      <path d={path} fill="none" stroke={endColor} strokeWidth={2} strokeLinejoin="round" />

      <circle cx={px(last.dist_m)} cy={py(last.speed_ms * 3.6)} r={3.5} fill={endColor} />

      <text x={PAD_L} y={H - 4} fill="var(--muted)" fontSize={9}>
        {dMin.toFixed(0)} m
      </text>
      <text x={W - PAD_R} y={H - 4} fill="var(--muted)" fontSize={9} textAnchor="end">
        apex
      </text>
    </svg>
  );
}
