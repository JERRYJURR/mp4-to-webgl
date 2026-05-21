// server-only enforced by Next.js route boundary
import type {
  AnalysisSchema,
  DiagnosisSchema,
  IterationKind,
  IterationRecord,
} from "../types";
import {
  callClaude,
  imageBlockFromFile,
  textBlock,
  type UserContentBlock,
} from "./claude-cli";

/**
 * Backend pipeline calls go through the `claude` CLI rather than the Anthropic
 * SDK, so they consume your Claude Code subscription rather than per-token API
 * credits. The CLI wrapper uses --no-session-persistence and an ephemeral cwd;
 * each call cleans up its temp dir and ~/.claude/projects entry on exit.
 *
 * Auth itself (OAuth/keychain) lives outside this module — we never read or
 * write it.
 */

// Model overrides go to the CLI via --model; defaults follow Claude Code's
// own default for the user's plan (we just don't pass --model unless asked).
const MODEL_ANALYSIS = process.env.CLAUDE_ANALYSIS_MODEL;
const MODEL_GENERATION = process.env.CLAUDE_GENERATION_MODEL;
const MODEL_DIAGNOSIS = process.env.CLAUDE_DIAGNOSIS_MODEL;

export const MODELS = {
  analysis: MODEL_ANALYSIS ?? "claude (cli, default)",
  generation: MODEL_GENERATION ?? "claude (cli, default)",
  diagnosis: MODEL_DIAGNOSIS ?? "claude (cli, default)",
};

function extractJson<T = unknown>(text: string): T {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < 0) throw new Error("no JSON object in response");
  return JSON.parse(cleaned.slice(first, last + 1)) as T;
}

function extractGlsl(text: string): string {
  const m = text.match(/```glsl\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const m2 = text.match(/```\s*([\s\S]*?)```/);
  if (m2) return m2[1].trim();
  return text.trim();
}

function extractJs(text: string): string {
  const m = text.match(/```(?:js|javascript)\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const m2 = text.match(/```\s*([\s\S]*?)```/);
  if (m2) return m2[1].trim();
  return text.trim();
}

const ANALYSIS_PROMPT = `You are a creative-coding analyst. Look at the supplied frames from a short looping video and return a strict JSON object that describes its visual feel — for a shader engineer who will procedurally synthesise the same vibe from scratch.

Return ONLY this JSON schema (no commentary):

{
  "subject_matter": string,
  "motion": {
    "camera": "static" | "slow_pan" | "fast_pan" | "handheld" | "zoom" | "none",
    "subject": string,
    "ambient": string
  },
  "motion_profile": {
    "speed": "static" | "slow" | "medium" | "fast" | "chaotic",
    "loop_strategy": "seamless_periodic" | "ping_pong" | "cyclic_noise" | "rotating_camera" | "pulsing",
    "dominant_direction": "none" | "upward" | "downward" | "left" | "right" | "inward" | "outward" | "rotational"
  },
  "composition": {
    "primary_layout": "centered" | "radial" | "horizontal_bands" | "vertical_bands" | "diagonal" | "scattered" | "full_frame_texture",
    "depth": "flat" | "shallow" | "layered" | "tunnel" | "volumetric",
    "symmetry": "none" | "horizontal" | "vertical" | "radial" | "kaleidoscopic"
  },
  "color_palette": {
    "dominant": ["#hex", "#hex"],
    "accents": ["#hex"]
  },
  "texture": [string],
  "temporal_events": [{ "t_seconds": number, "description": string }],
  "shader_strategy": {
    "recommended_technique": "fbm" | "domain_warp" | "raymarch" | "particles" | "voronoi" | "reaction_diffusion" | "postprocess" | "three_scene",
    "complexity": "simple" | "medium" | "high",
    "risks": [string]
  }
}

When to pick "three_scene" instead of one of the GLSL techniques:
- The footage shows **discrete objects with real 3D geometry** — cubes, spheres, characters, structured meshes — with depth parallax and visible 3D shading (cast shadows, ambient occlusion, surfaces catching light from a clear direction).
- The motion is **rigid-body or rotational** on identifiable objects (a tumbling cube, a spinning logo, scattered shapes moving through space).
- A fullscreen GLSL fragment shader would have to fake all of this through expensive CSG raymarching, and would still look wrong.

When NOT to pick "three_scene":
- The footage is an **abstract/textural field** — smoke, fluid, caustics, fbm, gradients, kaleidoscopic patterns. Procedural noise techniques will read better here than constructing a 3D scene.
- The "objects" are diffuse blobs without clean geometric edges — that's domain_warp / fbm territory, not three_scene.

Bias toward the GLSL techniques when the choice is unclear; three_scene is the right answer specifically when geometric structure is essential to what makes the footage look the way it does.`;

export async function analyzeVideo(
  framePaths: string[],
  durationSeconds: number,
): Promise<{ analysis: AnalysisSchema; model: string; raw: string }> {
  const content: UserContentBlock[] = [];
  for (const p of framePaths) content.push(await imageBlockFromFile(p));
  content.push(
    textBlock(
      `${ANALYSIS_PROMPT}\n\nVideo duration: ${durationSeconds.toFixed(3)} seconds.\nFrames are in chronological order.\nReturn JSON only.`,
    ),
  );

  const res = await callClaude({
    content,
    systemPrompt:
      "You are a precise vision analyst. Respond with strict JSON exactly matching the requested schema. No surrounding prose, no markdown.",
    model: MODEL_ANALYSIS,
    timeoutMs: 360_000,
  });

  return {
    analysis: extractJson<AnalysisSchema>(res.text),
    model: MODELS.analysis,
    raw: res.text,
  };
}

const FRAGMENT_GENERATION_PROMPT_BASE = `You are an expert WebGL2/GLSL shader engineer. Write the body of a Shadertoy-style fragment shader that *captures the feel* of a short looping video, given a structured analysis. The shader synthesises everything procedurally — no textures, no video sampling.

Available uniforms (already declared, do NOT redeclare):
  uniform float u_time;       // seconds, loops at u_duration
  uniform float u_duration;   // seconds
  uniform vec2  u_resolution; // pixels
  uniform float u_loop_phase; // u_time / u_duration, in [0,1]
  uniform vec2  u_loop_coord; // vec2(cos(2pi*phase), sin(2pi*phase))

Hard rules:
- WebGL 2 / GLSL ES 3.00. Use Shadertoy convention: implement only
    void mainImage(out vec4 fragColor, in vec2 fragCoord) { ... }
- Use procedural noise only (hash-based). NEVER call any pseudo-random API; everything derived from fragCoord and u_time.
- The shader MUST loop seamlessly: drive recurring motion from u_loop_phase / u_loop_coord, not from raw u_time.
- All loops must have static, small bounds (max ~128 iterations).
- Output finite values; clamp before fragColor if needed.
- No #version line, no precision lines, no uniform redeclarations.
- No comments referencing the iteration number or task.
- Return ONLY the shader body in a single fenced \`\`\`glsl block. No commentary.`;

const THREE_GENERATION_PROMPT_BASE = `You are an expert creative-coding engineer working in Three.js (r170+). Write a *scene-builder function body* that produces a generative Three.js scene capturing the feel of a short looping video, given a structured analysis.

You are writing the BODY of a function with this signature (do NOT include the function declaration; write only the body):

  function buildScene(THREE, ctx) {
    // ... YOUR CODE HERE ...
    return { scene, camera, update, dispose };
  }

The runtime provides:
  - THREE: the Three.js namespace (no imports needed; use THREE.* directly).
  - ctx:   { width, height, duration } — pixels and seconds.

You MUST return an object with:
  - scene:    a THREE.Scene
  - camera:   a THREE.Camera (typically PerspectiveCamera)
  - update:   function(t, dt) — called every frame. t is (elapsed % duration) in seconds; dt is the seconds since the previous frame (or 0 on the first call).
  - dispose:  optional function to release geometries/materials/textures you allocated.

Hard rules:
- The scene MUST loop seamlessly: every animated value must be a periodic function of (t / ctx.duration). Use sin/cos with phase = (t / ctx.duration) * 2*PI, or wrapped fract. Do NOT integrate state from dt — the rendered frame at t=0 and t=ctx.duration must match exactly.
- No \`fetch\`, no \`import\`, no asset loading. Procedural geometry and procedurally-generated colors/materials only.
- All scene resources live inside buildScene. No globals outside the function body.
- Materials must be deterministic — no Math.random() at runtime. If you need pseudo-random scatter, seed it from a hash of the index, defined inside the body.
- Do NOT create a THREE.WebGLRenderer — the runtime owns the renderer.
- Camera aspect must be ctx.width / ctx.height.
- Keep camera near/far reasonable (e.g. 0.1 .. 100). Avoid extreme numeric ranges that swiftshader (headless GL) may struggle with.
- No comments referencing the iteration number or task.
- Return ONLY the function body in a single fenced \`\`\`js block. No commentary.

Style guidance (not hard rules):
- For many identical objects (>50), use THREE.InstancedMesh.
- Looping example:
    const phase = (t / ctx.duration) * Math.PI * 2;
    mesh.rotation.y = phase;
    mesh.position.y = Math.sin(phase) * 0.5;
- At least one directional or ambient light; PBR materials (MeshStandardMaterial / MeshPhysicalMaterial) usually read better than basic.`;

interface GenerateInput {
  analysis: AnalysisSchema;
  priorDiagnosis: DiagnosisSchema | null;
  priorCode: string | null;
  compileErrors: string[];
  iterationIndex: number;
  preset?: string;
  /**
   * Selects which generation track to use. Defaults to "fragment" (existing
   * GLSL body) when omitted.
   */
  kind?: IterationKind;
  /**
   * If set, the previous approach has been rejected (either by the diagnosis
   * voting to pivot, or by the user explicitly asking to try something else).
   * The rejected code is shown to the model as an anti-example and priorCode
   * should be null. When `newTechnique` is set, the analysis's
   * `shader_strategy.recommended_technique` should already be overridden
   * upstream so the prompt is internally consistent. When it is not set,
   * Claude is told to pick a different technique itself.
   */
  pivot?: {
    rejectedCode: string;
    reason: string;
    newTechnique?: string;
    rationale?: string;
    userHint?: string;
  };
}

export async function generateShader(input: GenerateInput): Promise<{
  code: string;
  prompt: string;
  model: string;
  raw: string;
}> {
  const kind = input.kind ?? "fragment";
  const isThree = kind === "three_scene";
  const codeLang = isThree ? "js" : "glsl";
  const base = isThree
    ? THREE_GENERATION_PROMPT_BASE
    : FRAGMENT_GENERATION_PROMPT_BASE;

  const sections: string[] = [base];
  sections.push(`\n## Analysis\n${JSON.stringify(input.analysis, null, 2)}`);
  if (input.pivot) {
    const parts = [
      `\n## PIVOT: previous approach has been rejected\n`,
      `Reason: ${input.pivot.reason}\n`,
    ];
    if (input.pivot.newTechnique) {
      parts.push(`Mandated new technique: ${input.pivot.newTechnique}\n`);
      if (input.pivot.rationale) {
        parts.push(`Why this technique: ${input.pivot.rationale}\n`);
      }
    } else {
      parts.push(
        `No specific replacement technique has been mandated — choose one that is structurally different from the rejected approach.\n`,
      );
    }
    if (input.pivot.userHint) {
      parts.push(
        `\n## User hint about what to try instead\n${input.pivot.userHint}\n`,
      );
    }
    parts.push(
      `\n## Rejected prior approach — do NOT iterate on this code or its underlying technique\n` +
        `\`\`\`${codeLang}\n${input.pivot.rejectedCode}\n\`\`\`\n\n` +
        `Write a fresh ${isThree ? "scene" : "shader"}. Treat the rejected code as a counter-example — its overall structure is fine to reference, but the **central rendering idea** must change.`,
    );
    sections.push(parts.join(""));
  } else if (input.priorCode) {
    sections.push(
      `\n## Previous ${isThree ? "scene" : "shader"} (iteration ${input.iterationIndex - 1})\n\`\`\`${codeLang}\n${input.priorCode}\n\`\`\``,
    );
  }
  if (input.priorDiagnosis && !input.pivot) {
    sections.push(
      `\n## Diagnosis from previous iteration\n${JSON.stringify(input.priorDiagnosis, null, 2)}\nApply the suggested_changes — do not regress what already works.`,
    );
  } else if (input.priorDiagnosis && input.pivot) {
    sections.push(
      `\n## What was visually wrong in the prior iteration (still informative for the rewrite)\n` +
        JSON.stringify(input.priorDiagnosis.what_is_wrong, null, 2),
    );
  }
  if (input.compileErrors.length) {
    sections.push(
      `\n## ${isThree ? "Runtime/init errors" : "Compile errors"} from your last attempt(s) — fix these without removing creative content:\n${input.compileErrors.map((e) => "- " + e).join("\n")}`,
    );
  }
  if (input.preset) sections.push(`\n## Creative nudge\n${input.preset}`);
  sections.push(
    `\n## Goal\nIteration ${input.iterationIndex}. Output ONLY a fenced ${codeLang} block ${
      isThree
        ? "containing the body of the buildScene function (no function declaration line)."
        : "containing a complete `mainImage` function."
    }`,
  );
  const prompt = sections.join("\n");

  const res = await callClaude({
    content: [textBlock(prompt)],
    systemPrompt: isThree
      ? "You are an expert Three.js creative-coding engineer. Respond with exactly one fenced ```js block containing the buildScene function body. No commentary."
      : "You are an expert GLSL shader engineer. Respond with exactly one fenced ```glsl block containing the shader body. No commentary.",
    model: MODEL_GENERATION,
    timeoutMs: 360_000,
  });

  return {
    code: isThree ? extractJs(res.text) : extractGlsl(res.text),
    prompt,
    model: MODELS.generation,
    raw: res.text,
  };
}

const DIAGNOSIS_PROMPT = `You are reviewing how well a procedural rendering captures the feel of a source video.
You're shown matched frame pairs: for each timestamp, the source frame appears first, the rendered frame second.
The iteration's "kind" is named below the schema along with the code — either "fragment" (a GLSL fragment shader
body) or "three_scene" (a JavaScript body that returns a Three.js scene).

Numerical scores rank iterations; your job is to translate the visual gap into specific, actionable next steps
and to call a pivot when the technique itself is the bug.

Two things you MUST decide:

1) recommended_action: "tweak" or "pivot"

   - "tweak" → small-to-medium changes within the current technique can plausibly close the gap.
     Examples: scale a count up, retune a color palette, change a frequency, swap a material property,
     reduce octaves, add a light, slow down the loop.

   - "pivot" → the current technique is *structurally incapable* of matching the source.
     A pivot throws away the iteration's code; only call for it when the technique itself is the bug.

   Bias toward "tweak" if in doubt. But pivot decisively when one of these is true:

     * Cross-kind mismatch
       - Source has rigid discrete 3D objects with clear shading and depth parallax,
         but the iteration is a fragment shader → pivot to "three_scene".
       - Source is a continuous procedural field (smoke, fluid, caustics, gradients),
         but the iteration is a Three.js mesh scene → pivot to "fbm" or "domain_warp" (or another GLSL technique).

     * Within-kind structural mismatch (fragment only)
       - fbm noise trying to render clean vector-like curves → pivot to "domain_warp" + smoothstep, or "raymarch".
       - Flat 2D field trying to render volumetric depth → pivot to "raymarch".
       - Continuous field trying to render discrete particles → pivot to "particles" (or "three_scene" if they have depth).

     * Within-kind structural mismatch (three_scene)
       - Three.js scenes pivot to a different GLSL technique only when the kind itself is wrong (see cross-kind above).
       - If the kind is right but the *internal* approach is wrong (wrong geometry primitive, wrong light type,
         wrong material), that is a tweak, not a pivot — the next iteration can rewrite the scene body freely.

2) suggested_changes: concrete bullets the next iteration must follow.

   For "fragment" iterations, good suggested_changes look like:
     - "Reduce fbm octaves from 6 to 3 — the rendered field is too detailed for the source's smooth blobs."
     - "Shift palette warmer: the dominant rendered color (0.2, 0.4, 0.8) should be a deeper teal (0.05, 0.35, 0.45)."
     - "Loop closes ~15% too fast — divide u_loop_phase by 1.15 in the main motion driver."
     - "Replace per-pixel hash noise with domain_warp(fbm(p)) to get the swirling motion in the source."

   For "three_scene" iterations, good suggested_changes look like:
     - "Increase the cube count from ~20 to ~60 to match the dense cluster in the source."
     - "Swap MeshBasicMaterial for MeshStandardMaterial; the source has clear directional shading."
     - "Add a soft ambient light (intensity ~0.4) — the current scene is too contrasty."
     - "Distribute cube positions in a 3D Gaussian around origin instead of a flat XY plane; the source has clear depth."
     - "Drive rotation from phase = (t / ctx.duration) * Math.PI * 2, not raw t — the loop doesn't currently close."
     - "Switch from individual meshes to THREE.InstancedMesh — at >50 cubes this will drop the capture frame rate badly."

Hard requirements for suggested_changes:
  - Every change must be actionable inside the next iteration with no further clarification.
  - Avoid vague verbs like "improve", "enhance", "polish" — name the lever and the direction.
  - When possible, reference specific identifiers visible in the code.
  - If you suggest a parameter delta, give a concrete number range, not "more" or "less".

Return ONLY a strict JSON object matching this schema:

{
  "score_delta_explanation": string,
  "what_is_wrong": [string],
  "suggested_changes": [string],
  "request_additional_frames_at": [number],
  "recommended_action": "tweak" | "pivot",
  "pivot_reason": string | null,
  "new_strategy": {
    "recommended_technique": "fbm" | "domain_warp" | "raymarch" | "particles" | "voronoi" | "reaction_diffusion" | "postprocess" | "three_scene",
    "rationale": string
  } | null
}

When recommended_action == "pivot", pivot_reason and new_strategy MUST be filled.
When recommended_action == "tweak", pivot_reason and new_strategy MUST be null.`;

export async function diagnoseIteration(
  pairs: { t: number; source: string; rendered: string }[],
  iteration: Pick<IterationRecord, "scores" | "shader_code" | "kind">,
): Promise<{ diagnosis: DiagnosisSchema; prompt: string; model: string; raw: string }> {
  const content: UserContentBlock[] = [];
  for (const pair of pairs) {
    content.push(textBlock(`t=${pair.t.toFixed(2)}s (source then rendered):`));
    content.push(await imageBlockFromFile(pair.source));
    content.push(await imageBlockFromFile(pair.rendered));
  }
  const kind = iteration.kind ?? "fragment";
  const codeLang = kind === "three_scene" ? "js" : "glsl";
  const codeLabel =
    kind === "three_scene"
      ? "Three.js scene body (kind: three_scene)"
      : "Shader code (kind: fragment)";
  const promptText = `${DIAGNOSIS_PROMPT}

## Iteration under review

Kind: ${kind}
Numeric scores: ${JSON.stringify(iteration.scores)}

${codeLabel}:
\`\`\`${codeLang}
${iteration.shader_code}
\`\`\``;
  content.push(textBlock(promptText));

  const res = await callClaude({
    content,
    systemPrompt:
      "You are a precise diagnostic reviewer. Respond with strict JSON exactly matching the requested schema. No surrounding prose, no markdown.",
    model: MODEL_DIAGNOSIS,
    timeoutMs: 360_000,
  });

  return {
    diagnosis: extractJson<DiagnosisSchema>(res.text),
    prompt: promptText,
    model: MODELS.diagnosis,
    raw: res.text,
  };
}
