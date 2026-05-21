# MP4 → WebGL Shader: Iterative Generation Spec

## Goal

Build a frontend where a user can upload mp4 files (or select from a curated sample gallery) and trigger an iterative Claude loop that produces a generative WebGL shader **capturing the feel of the video** — looping, deterministic, time-synced to the original's duration.

The shader synthesizes all visuals from `u_time`, `u_resolution`, and procedural functions. The source video is **not** sampled at runtime. The system is a demonstration of AI writing real shader code from scratch and iterating on it — not a video filter.

## Design Decisions

This section exists so future spec revisions don't quietly compromise the project's thesis. These decisions are deliberate, not omissions.

**No template fallbacks.** If the LLM cannot produce a working shader after compile-repair attempts, the iteration is marked `failed` and the previously-best iteration stays displayed. The system does not fall back to a known-good template with parameter substitution. The thesis of the demo is that AI iteratively writes real shaders; substituting templates when iteration fails turns the demo into a parameter editor and any designer watching will clock it within seconds.

**Scoring uses external numeric metrics, not LLM self-judgment.** Vision-model diagnosis drives the *direction* of the next iteration but does not determine convergence. The combined score is computed from independent numeric metrics (LPIPS, optical flow correlation, loop continuity). If the generator is also the judge, the loop can fool itself; the numeric stack is a cheap external gradient that prevents this.

**Mode is locked to generative-only.** The shader does not have access to the source video at runtime. A future "Mode B" stylization mode is deferred (see *What's Deferred*).

**CLIP is not used.** CLIP embeddings are noisy for the abstract/textural footage this system targets best (smoke, water, particles, light). Semantic signal comes from the vision-diagnosis pass, which is qualitative; numeric signal comes from perceptual + motion + continuity, which is quantitative. Adding CLIP between them adds cost without resolving information.

**UI is deliberately minimal.** Engineering signals (diagnosis text, per-frame comparison scores, frame-pair contact sheets) are persisted but not surfaced in the main overlay. The booth-facing UI privileges the shader playing big with the iteration list as nav; engineering UI lives in data and a dev-mode panel, not in the user view. Trust the eye, let the shader breathe.

## Architecture

Server-side orchestration, thin frontend.

- **Backend** (Node, TypeScript): runs the iteration loop, calls the Claude API, manages headless Playwright capture, persists per-video state, exposes REST + WebSocket endpoints for live status.
- **Frontend** (Next.js + React + Tailwind): displays videos, iteration history, overlay viewer. Subscribes to backend WebSocket for live iteration status. Renders the shader client-side in a `<canvas>` for playback.
- **Headless capture**: Playwright in Node, hitting a `/render` endpoint that loads the shader at a specified `u_time` and returns a frame.

Single Node process. JSON files for persistence with atomic writes. Cancellation is supported (in-flight iteration marked `cancelled`). Full queue/worker infrastructure deferred.

## The Iteration Loop

States, all visible in the UI:

```
queued → analyzing → generating → compiling → capturing → scoring → done
                                       │
                                       └─→ failed (with failure_reason)
                                       └─→ cancelled
```

Per iteration:

1. **Analyze** — On the first iteration, `ffprobe` pulls metadata (duration, framerate, resolution, rotation). `ffmpeg` extracts ~12 evenly-spaced frames plus boundary frames at `0` and `duration - epsilon`. Claude is called with the frames + structured prompt and returns the Analysis Schema. On later iterations, the prior iteration's diagnosis is the primary input; new frames are pulled only if Claude requests them via `request_additional_frames_at`.
2. **Generate** — Claude writes a Shadertoy-convention fragment shader body. Context: the analysis schema, the diagnosis from the prior iteration (if any), compile errors from any prior compile-repair attempts.
3. **Compile** — Shader is compiled in a headless WebGL 2 context. Compile errors are captured. **Up to 3 compile-repair attempts** are allowed within this iteration (the compile log is fed back to the model for each retry). Compile-repairs do not count toward the creative iteration budget. After 3 failed repairs, the iteration is marked `failed` with `failure_reason: compile_failed` and counts toward budget.
4. **Capture** — Playwright loads the shader page with `u_duration` equal to the source video's duration and captures frames at the same timestamps as the ffmpeg extractions, including `0` and `duration - epsilon` for loop-continuity scoring.
5. **Score** — Three-component comparison (see Comparison & Scoring). Numeric scores feed convergence; the vision-diagnosis pass shapes the next prompt.
6. **Persist** — Iteration record (code, frames, scores, prompts, diagnosis, model versions, compile log) is written atomically to the video's `state.json`.

Budget: max 5 *creative* iterations (compile-repairs excluded). The loop stops earlier if the combined score plateaus (no improvement for 2 consecutive iterations) or the user pauses/cancels.

## Analysis Schema

Claude returns structured JSON on the analysis pass:

```json
{
  "subject_matter": "string",
  "motion": {
    "camera": "static | slow_pan | fast_pan | handheld | zoom | none",
    "subject": "string",
    "ambient": "string"
  },
  "motion_profile": {
    "speed": "static | slow | medium | fast | chaotic",
    "loop_strategy": "seamless_periodic | ping_pong | cyclic_noise | rotating_camera | pulsing",
    "dominant_direction": "none | upward | downward | left | right | inward | outward | rotational"
  },
  "composition": {
    "primary_layout": "centered | radial | horizontal_bands | vertical_bands | diagonal | scattered | full_frame_texture",
    "depth": "flat | shallow | layered | tunnel | volumetric",
    "symmetry": "none | horizontal | vertical | radial | kaleidoscopic"
  },
  "color_palette": {
    "dominant": ["#hex", "#hex"],
    "accents": ["#hex"]
  },
  "texture": ["smooth", "grainy", "glassy", "particulate", "flat", "..."],
  "temporal_events": [
    { "t_seconds": 0.0, "description": "string" }
  ],
  "shader_strategy": {
    "recommended_technique": "fbm | domain_warp | raymarch | particles | voronoi | reaction_diffusion | postprocess",
    "complexity": "simple | medium | high",
    "risks": ["string"]
  }
}
```

Diagnosis schema (returned after scoring, fed into the next iteration's prompt):

```json
{
  "score_delta_explanation": "string",
  "what_is_wrong": ["specific differences in language"],
  "suggested_changes": ["concrete shader-level changes"],
  "request_additional_frames_at": [12.4, 28.1]
}
```

## Shader Contract

All generated shaders conform to Shadertoy's `mainImage` convention. The scaffold (not the generated body) provides:

- `precision highp float;` declaration at the top
- A fullscreen quad
- `u_time` (float, seconds, loops at `u_duration`)
- `u_duration` (float, seconds, equals the source video's duration)
- `u_resolution` (vec2)
- `u_loop_phase` (float, `u_time / u_duration`, in `[0, 1]`)
- `u_loop_coord` (vec2, `vec2(cos(2π·u_loop_phase), sin(2π·u_loop_phase))`) — for seamless periodic animation

The AI generates only the body of:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // generated content
}
```

**Stochasticity vs determinism:** the *generation step* (LLM writes code) is stochastic. The *runtime shader* must be deterministic given `u_time` and `fragCoord`. "Re-roll" produces a different shader; once generated, that shader renders identically every time. No `Math.random()`-equivalents; all noise must be procedural (hash-based) and seeded from `fragCoord` and `u_time` only.

**Seamless looping is required.** A wrapping `u_time` does not produce a seamless visual — most procedural functions jump at the boundary. Generated shaders must use `u_loop_coord` (or equivalent periodic coordinates derived from `u_loop_phase`) for any recurring animation, so frames at `t = 0` and `t = duration - epsilon` are visually continuous. The scoring pipeline explicitly compares these boundary frames to penalize loop discontinuities.

**Resource constraints:**

- Static loop bounds only (max ~128 iterations for any loop)
- All output channels must be finite values
- Default target is WebGL 2; derivatives (`dFdx`/`dFdy`) are core and allowed
- Per-frame render must complete within a 1s runtime budget; exceeding produces a `failed` iteration with `failure_reason: timeout`

## Frame Capture Pipeline

Capture is server-side and deterministic.

- A `/render` route serves a minimal HTML page that loads the shader, sets `u_duration` and `u_time` from query params, renders one frame, and exposes a `window.__captureReady` signal.
- Playwright opens the page, awaits `__captureReady`, captures via `page.locator('canvas').screenshot()`. PNG bytes are stored to disk.
- Capture timestamps mirror the ffmpeg extraction timestamps exactly. Boundary timestamps (`0`, `duration - epsilon`) are always included.

**Deterministic capture settings** (pinned, recorded per iteration):

- Pinned browser version (via the installed Playwright version)
- Fixed viewport (default: source aspect fit into 512×512)
- `deviceScaleFactor: 1`
- Antialiasing disabled
- `preserveDrawingBuffer: true`
- WebGL 2 explicit
- Canvas size set explicitly, not CSS-derived

## Comparison & Scoring

Three numeric components, plus a qualitative diagnosis. Computed against matched frame pairs (including boundary frames for loop continuity).

1. **LPIPS** (perceptual distance, lower = better):
   `lpips_score = clamp(1.0 - lpips_distance, 0.0, 1.0)`
2. **Optical flow correlation** — for each pair of consecutive frames in both source and shader output, compute optical flow (OpenCV Farnebäck). Compare flow magnitude distributions. Catches "wrong motion intensity / wrong motion direction."
3. **Loop continuity score** — perceptual distance (LPIPS) between the shader's boundary frames at `0` and `duration - epsilon`. Penalizes visible loop jolts directly.

Persisted scores keep raw and normalized values separate:

```json
{
  "lpips_distance": 0.42,
  "lpips_score": 0.58,
  "optical_flow_correlation": 0.71,
  "loop_continuity_distance": 0.12,
  "loop_continuity_score": 0.88,
  "combined": 0.69
}
```

Default weighting: `combined = 0.4·lpips + 0.4·optical_flow + 0.2·loop_continuity`. Tunable per video.

The **vision-model diagnosis** runs after numeric scoring. Claude is shown a contact sheet of matched frame pairs and returns the diagnosis schema. **This shapes the next iteration's prompt — it does not determine the score.** Numeric scores tell the system whether it's improving; the diagnosis tells the model what to change.

## Failure Handling

First-class states, not exceptions. `state` carries the lifecycle class; `failure_reason` carries the specific cause.

Terminal states:

- `done` — iteration completed and was scored
- `failed` — iteration ended in a failure mode (see `failure_reason`)
- `cancelled` — user paused or cancelled mid-iteration

Failure reasons:

- `compile_failed` — GLSL compile failed after 3 repair attempts
- `runtime_failed` — WebGL runtime error during render
- `blank_output` — canvas detectably blank or uniform-color across all sampled frames
- `timeout` — frame render exceeded the runtime budget

Behavior:

- The currently displayed iteration in the overlay stays on the last `done` iteration.
- Failure details (compile log, runtime error, blank-detection diagnostic) are persisted and surfaced in the UI.
- The relevant log is fed back as additional context to the next iteration's generation prompt.
- Failed iterations count toward the 5-iteration budget but the convergence tracker ignores them.

There is no template fallback. A failed iteration shows the failure in the UI and the previously-best iteration remains the displayed shader. This is intentional (see *Design Decisions*).

## Convergence & Branching

- Each iteration's combined score is recorded.
- `best_so_far` tracks the highest-scoring `done` iteration regardless of recency.
- "New iteration" defaults to branching from `best_so_far`. The user can override by selecting any iteration as the parent.
- Iteration history is a tree, not a list, persisted per video.

## Manual Creative Controls (Backend Capability, UI Deferred)

The backend should support customization of the analysis and prompt before generating a new iteration. The current minimal overlay does not surface these controls — the user view has only `View code` and `New iteration`. The capability remains in the backend so a future UI surface (likely a modal triggered from "New iteration," or accessed from the iteration's code panel) can be added without backend changes.

Backend-supported parameters for a future surface:

- Override `subject_matter` ("treat as smoke / fire / water / particles / light / fabric / custom")
- Override `color_palette` (dominant + accent colors)
- Override `motion_profile.speed` (calm / flowing / chaotic / pulsing)
- Override `shader_strategy.recommended_technique` (noise / particles / raymarch / bands / kaleidoscope)
- Preset nudges prepended to the generation prompt (*Make more abstract*, *Make closer to source*, *Make loop smoother*, *Simplify*, *More chaos*)
- Re-roll mode (same prompt, different generation) vs Iterate mode (apply diagnosis for directed change)

In v1, "New iteration" defaults to Iterate mode — it uses the prior iteration's diagnosis to drive directed change.

## Persistence

Per video, at `/videos/{video_id}/state.json`. Atomic writes only: write to `state.tmp.json` → `fsync` → rename to `state.json`. Frames live at `/videos/{video_id}/frames/`.

```json
{
  "video_id": "string",
  "filename": "string",
  "source_path": "videos/{video_id}/source.mp4",
  "thumbnail_path": "videos/{video_id}/thumbnail.png",
  "metadata": {
    "duration": 0,
    "framerate": 0,
    "resolution": [0, 0],
    "rotation": 0,
    "codec": "string"
  },
  "analysis": {
    "initial": { },
    "edited": { },
    "frames_used": ["paths..."]
  },
  "iterations": [
    {
      "id": "string",
      "parent_id": "string | null",
      "state": "queued | analyzing | generating | compiling | capturing | scoring | done | failed | cancelled",
      "failure_reason": "compile_failed | runtime_failed | blank_output | timeout | null",
      "shader_code": "string",
      "diagnosis": { },
      "scores": {
        "lpips_distance": 0,
        "lpips_score": 0,
        "optical_flow_correlation": 0,
        "loop_continuity_distance": 0,
        "loop_continuity_score": 0,
        "combined": 0
      },
      "prompts": {
        "generation": "string",
        "diagnosis": "string"
      },
      "models": {
        "analysis_model": "string",
        "generation_model": "string",
        "diagnosis_model": "string"
      },
      "compile": {
        "status": "success | failed",
        "log": "string",
        "repair_attempts": 0
      },
      "capture": {
        "viewport": [512, 512],
        "device_scale_factor": 1,
        "webgl_version": 2,
        "timestamps": [0, 1.5, 3.0]
      },
      "comparison_frames": [
        {
          "t": 0.0,
          "source": "frames/source_000.png",
          "rendered": "frames/iter_001_000.png"
        }
      ],
      "created_at": "ISO timestamp",
      "completed_at": "ISO timestamp"
    }
  ],
  "best_iteration_id": "string"
}
```

## Frontend / UX

Use the Paper MCP (Paper Design's canvas tool) to read the design source of truth.

**Homepage**:

- Curated sample gallery (preloaded videos known to produce strong results: ink in water, smoke, lightning, ocean caustics, particles, light leaks, fabric movement)
- Upload zone (also accepts any user mp4)
- Each video card shows thumbnail, filename, and iteration count

**Overlay**:

- **Sidebar (left)**: source video thumbnail at the top, filename below with a small inline play button (tap to play the original mp4 in place). Below, an `ITERATIONS` header and the iteration list.
- **Iteration list**: numbered iterations (*Iteration 1, Iteration 2, …*). Selected iteration shown with a pill background. New-since-viewed iterations shown bold with a small dot indicator. In-progress iterations show a spinner inline with a short status label — *Analyzing…*, *Generating…*, *Compiling…*, *Capturing…*, *Scoring…*. Failed iterations show their friendly failure label — *Compile failed*, *Render failed*, *Blank output*, *Timed out*, *Cancelled*.
- **Hero (right)**: the selected iteration's shader plays here at full size, autoplay and looping.
- **Bottom-right actions**: `View code` and `New iteration`.
- **View code** opens a panel showing the iteration's shader source as the primary content. Scores and diagnosis are available as collapsible sections beneath the code, collapsed by default — useful for debugging or curiosity, not foregrounded.
- **New iteration** triggers a new iteration branching from the currently selected iteration. Backend determines `best_so_far` for internal use but the UI doesn't surface it; the human picks visually which iteration to branch from by selecting it before clicking.

**Components frame**: every state explicitly rendered for completeness — selected, unread/new, in-progress (each lifecycle phase), done, and each failure variant with its friendly label. No silent states.

The inline status labels in the iteration list are the only progress indicator needed. No separate progress UI, no side-by-side comparison, no contact-sheet panel, no score visualization in the list. The shader is the hero; everything else is navigation.

## Upload & Sample Guidance

Surfaced on the homepage:

> Strongest results come from abstract or textural footage — smoke, water, lightning, particles, fog, dye-in-water, fabric, atmospheric light. The sample gallery above is curated for reliable output. Real footage with faces, language, or fast cuts will mostly fail to converge — that's a limitation of fragment-shader synthesis from scratch, not the loop.

Minimal preprocessing on upload: probe metadata, apply rotation, transcode to H.264 if codec is unusual, generate thumbnail.

## Open Questions

- Frame count for analysis: ~12 is a starting guess. May want to scale with duration (1 per 2 seconds, capped at 24) plus scene-change detection for cut-heavy footage.
- LPIPS implementation: ship a small Python helper invoked from Node, or find a JS port? Python is more reliable but adds a runtime dependency.
- Optical-flow library: OpenCV Python is the obvious pick if Python is already in the stack for LPIPS.
- Should "Re-roll" share the iteration budget with "Iterate", or have its own budget? Currently treats them the same.

## What's Deferred

Pick up if this earns a second life:

- **Mode B (source-assisted)** — shader gets the video as `iChannel0` for stylization. Different artifact, useful for some users, but not the project's thesis. If revisited, will need Playwright video-seek-and-upload logic for deterministic capture.
- Template fallbacks for shader generation — intentionally rejected (see *Design Decisions*). Listed here only so future spec passes know it was a decision, not an omission.
- SQLite + content-addressed blob storage instead of JSON + filesystem.
- Formal queue/worker architecture with job persistence.
- Hardened upload pipeline (path-traversal protection, dedup by content hash, HDR/VFR/exotic-codec normalization).
- Cost-optimized diagnosis using contact-sheet-only inputs instead of full pair lists.
- Additional embedding models (DINOv2, SigLIP) as semantic signal. Intentionally not in v1 — vision-diagnosis covers the semantic role qualitatively.
- Formal acceptance criteria as a spec section (sufficient to hold v1 criteria in your head).