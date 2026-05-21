# mp4 → WebGL: iterative shaders

A frontend + iteration loop where you upload an `.mp4`, and Claude writes a
generative WebGL2 fragment shader from scratch that captures the *feel* of the
video — looping, deterministic, time-synced.

The shader synthesises every pixel from `u_time` / `u_resolution` /
`u_loop_phase`. The source video is never sampled at runtime; it is the target
the loop is trying to match.

See `specs.md` for the full design contract.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run seed                 # import the bundled sample mp4s
npm run dev
```

Open <http://localhost:3000>, pick a sample (or upload your own), click
`New iteration`.

## Environment

- `ANTHROPIC_API_KEY` — required for analysis, generation, and diagnosis calls.
- `CLAUDE_GENERATION_MODEL`, `CLAUDE_ANALYSIS_MODEL`, `CLAUDE_DIAGNOSIS_MODEL` —
  optional model overrides. Defaults: Opus 4.7 for analysis/generation, Sonnet
  4.6 for diagnosis (cheap diagnosis is fine).

## Architecture

- `app/` — Next.js app router. `app/page.tsx` is the homepage gallery,
  `app/video/[videoId]/page.tsx` is the overlay viewer,
  `app/render/[videoId]/[iterationId]/page.tsx` is the deterministic capture
  page used by Playwright.
- `lib/shader/` — GLSL scaffold + uniform contract + runtime that mounts the
  generated body inside a fullscreen quad and animates it.
- `lib/pipeline/` — analyze (ffmpeg + Claude vision), generate (Claude code),
  compile (headless Chromium with WebGL2), capture (Playwright screenshots),
  score (rgb-L2 + ssim-like + flow-magnitude correlation + loop-continuity),
  diagnose (Claude vision over matched frame pairs).
- `lib/persist.ts` — atomic JSON state writes at `videos/{id}/state.json`.
- `lib/events.ts` + `app/api/videos/[videoId]/stream/route.ts` — SSE bus that
  pushes iteration lifecycle updates to the overlay UI.

## Notes / deviations from `specs.md`

- LPIPS and optical-flow correlation are computed in pure JS as a perceptual
  proxy (RGB-L2 + structural-similarity-like + luma frame-difference
  correlation). The orchestrator stores a `notes` field marking these as
  proxies. Wiring real LPIPS via Python is straightforward; see
  `lib/pipeline/score.ts`.
- The frontend live channel is SSE rather than WebSocket — same role, simpler
  to ship in Next.js app router.

## File layout

```
videos/
  {videoId}/
    source.mp4
    thumbnail.png
    state.json           # atomic writes
    frames/
      source_000.png …
      iter_001_000.png …
```
