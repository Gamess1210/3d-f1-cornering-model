Paste everything below into Fable 5.1 as the kickoff prompt.

---

You are the ORCHESTRATOR for a hackathon build. Time is extremely limited. Your job is to break this into subtasks and dispatch them to sub-agents, not to write everything yourself.

**Agent routing rule (follow strictly):**
- Anything **visual, creative, or 3D** (Three.js/R3F scene composition, track ribbon geometry with banking/elevation, car model + camera work, materials/lighting, motion/animation feel, UI layout polish, the "wow" factor) → spawn a **Fable** sub-agent.
- Anything **basic/mechanical** (wiring a slider to state, JSON loading, prop plumbing, npm/config fixes, writing a results readout, unit-ish glue code) → spawn an **Opus** sub-agent.
- Work in parallel wherever tasks don't depend on each other. Keep checking sub-agent output against the "Definition of done" below — cut scope, not corners on what's already working.

## What already exists (do not rebuild these)

Project root: `C:\Users\geoff\DevBuilds\3D F1 Model`

- `physics/` — complete, standalone TypeScript physics engine (no Three.js dependency). `cornerModel.ts` exports `computeCornering(corner, params) -> CorneringResult`. Also: `aero.ts` (downforce/drag from wing sliders + wind), `tires.ts` (wear-based grip loss), `frictionCircle.ts`, `brakeModel.ts` (braking-point → achieved apex speed via distance-stepped integration), `constants.ts`, `types.ts`. Has passing calibration sanity tests in `physics/__tests__/cornerModel.test.ts` (run `npm test`).
- `data/spa/la-source.json` and `data/spa/eau-rouge-raidillon.json` — real centerline geometry (from TUMFTM racetrack-database, OpenStreetMap-derived) for the two corners in scope, re-based to a local origin, plus `primaryApex` (radius, banking) that plugs straight into `computeCornering`.
- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx` — a working Vite + React + TypeScript scaffold. React Three Fiber, drei, three, and zustand are already declared as dependencies (run `npm install` if not already done).
- `src/App.tsx` — a **plain-HTML wiring stub** proving the data → physics → UI pipeline works (corner picker, sliders for front/rear wing, braking point, wind; live-updates `computeCornering` output). **This is intentionally not styled/3D — replace its guts with the real scene, keep the state/logic pattern.**

## Scope (do not expand this — cut further if time is short)

**One track only: Spa-Francorchamps. Exactly two selectable corners:**
1. **La Source** (`data/spa/la-source.json`) — tight hairpin, ~17m radius, real-world reference ~80 km/h.
2. **Eau Rouge/Raidillon** (`data/spa/eau-rouge-raidillon.json`) — fast uphill left-right-left complex, ~96m representative radius, real-world reference ~300 km/h, ~30m elevation gain (render as a visible climb — this is the single biggest "wow" opportunity in the whole build).

**Three primary interactive sliders** (already wired in the stub):
- Front + rear wing angle (downforce/drag)
- Braking point before apex (distance)
- Wind speed + direction

Tire wear and racing-line adjustment exist in the physics types/model already but are **stretch-only** — wire them only if the three primary sliders + 3D scene are done and working.

## Definition of done (build to this, in priority order)

1. Corner picker (La Source / Eau Rouge-Raidillon) renders a 3D track ribbon from that corner's centerline JSON (extrude width using `wLeft`/`wRight`; bank the cross-section using `bankingDeg`; for Eau Rouge, apply the elevation climb across the segment so the uphill is visually obvious).
2. A car (simple mesh is fine — a low-poly wedge/box with wheels beats no car) sits at the apex, oriented to the corner.
3. Moving the three sliders visibly changes the computed result in real time: apex speed number, a color-coded "on limit / off track" state, and ideally the car (or a ghost trail) reacting — e.g. car position drifts wide off the racing line when `isOnLimit` is false.
4. Basic camera (orbit controls via drei is fine) and lighting so it reads as a real 3D scene, not a wireframe.
5. **Stretch, only if time remains:** speed-trace chart from `result.distanceProfile`, tire wear slider, entry-line slider (`lineRadiusMultiplier`), banked-corner car lean/roll.

## Time pressure — explicit permission to cut scope

If running short: ship one corner fully polished over two corners half-done. Ship the plain-HTML stub with a nicer skin over a broken 3D scene. A live, visibly-reacting-to-sliders demo of Eau Rouge alone beats a non-functional "complete" build. State clearly at the end what was cut and why.

---
