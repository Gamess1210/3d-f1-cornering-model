# Spa Cornering Model — La Source & Eau Rouge/Raidillon

**[Open the live app](https://gamess1210.github.io/3d-f1-cornering-model/)** — no install needed, runs in the browser.

Interactive 3D model of how an F1 car's cornering speed responds to setup and driver inputs,
built on real Spa-Francorchamps centerline geometry and a standalone physics engine.

## Run

```
npm install
npm run dev        # http://localhost:5173
npm test           # physics calibration tests
npm run build      # typecheck + production bundle
```

## Demo script (90 seconds)

1. **La Source** opens on the limit: braking point 93 m, apex ~58 km/h vs a 64.5 km/h grip limit.
   The red car laps the hairpin on an out-in-out line; the racing line glows green.
2. Drag **Braking point** down to ~75 m. The HUD flips to red "OVER BY … RUNNING WIDE", the racing
   line turns red, and on the next pass the car runs wide past the apex onto the grass. A translucent
   ghost marks where a car on the limit would sit.
3. Switch to **Eau Rouge / Raidillon**. The camera flies to the hill; the track climbs 30 m.
   Wings default to 90 % so the car is on the limit at ~282 km/h vs a ~288 km/h ceiling.
4. Pull **Rear wing** down to ~60 %. Grip limit drops to ~220 km/h and the car washes out over the
   crest. Add a **tailwind** (wind heading ≈ car heading + 180°) for the same effect with wings alone.
5. Press **Chase** in the transport bar to ride behind the car up Raidillon.

## URL deep-links (demo / screenshots)

```
/?corner=eau-rouge-raidillon           select a corner
/?corner=la-source&bp=75               braking point override (m)
/?wing=0.3&wind=15&windDir=180         wing (0..1), wind m/s, wind heading
/?cam=chase                            start in chase camera
/?t=6                                  fast-forward the first lap by N seconds
```

## Architecture

| Layer | Path | Notes |
|---|---|---|
| Physics | `physics/` | Dependency-free. `computeCornering(corner, params)` solves apex speed (aero + tires + banking) and integrates the braking zone. |
| Corner data | `data/spa/*.json`, `src/track/cornerData.ts` | Real centerlines (TUMFTM racetrack-database). `cornerData.ts` adds elevation profile, apex markers, per-corner defaults and camera hints. |
| State | `src/state/store.ts` | zustand. Params → `computeCornering` on every change. Playback transport + camera mode. |
| 3D | `src/track/geometry.ts`, `src/scene/*` | Track ribbon extruded from `wLeft`/`wRight`, banked and elevated; kerbs, racing line, apex pins, embankment, sky/sun. `CarOnTrack` drives a low-poly F1 car along the physics speed profile and runs wide when over the limit. |
| UI | `src/ui/*` | Corner picker, three primary sliders (+ stretch sliders under "Advanced"), live readout, speed trace SVG, transport bar. |

## Scope notes

- Two corners only, one track. Elevation is applied to the Eau Rouge ribbon visually; the physics
  model treats the corner as flat (documented as a stretch term in the physics notes).
- The car's out-in-out line is built around the primary apex. On Eau Rouge the Raidillon and crest
  sub-apexes are marked but not individually followed by the car.
- Tire wear and racing-line multiplier are wired under "Advanced (stretch)" because the physics already
  supported them; they are not part of the primary demo.
