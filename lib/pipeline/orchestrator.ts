// server-only enforced by Next.js route boundary
import path from "node:path";
import fs from "node:fs/promises";
import { readState, renumberIterations, writeState, updateState } from "../persist";
import { emitVideoUpdate, emitIterationUpdate } from "../events";
import { newIterationId } from "../id";
import { videoFramesDir } from "../paths";
import { extractFramesAtTimes, extractionTimestamps } from "./ffmpeg";
import { analyzeVideo, diagnoseIteration, generateShader, MODELS } from "./claude";
import { capturePlayedFrames, detectBlankness } from "./capture";
import { scoreIteration } from "./score";
import { assembleShader } from "../shader/scaffold";
import type {
  ComparisonFrame,
  FailureReason,
  IterationKind,
  IterationRecord,
  IterationState,
  ShaderTechnique,
  VideoState,
} from "../types";

const inflight = new Map<string, Promise<void>>();
const cancelled = new Set<string>();

export function isRunning(videoId: string): boolean {
  return inflight.has(videoId);
}


export function requestCancel(videoId: string) {
  cancelled.add(videoId);
}

function nowIso() {
  return new Date().toISOString();
}

export interface StartIterationInput {
  videoId: string;
  parentIterationId: string | null;
  preset?: string;
  baseUrl: string;
  /**
   * User-driven pivot: treat the parent iteration's code as a rejected
   * counter-example regardless of what the diagnosis said.
   */
  forcePivot?: boolean;
  /** User picked a specific replacement technique from the modal. */
  pivotTechnique?: ShaderTechnique;
  /** Free-text hint from the "Tell Claude what to try instead" modal. */
  pivotHint?: string;
}

async function pushIteration(
  videoId: string,
  iter: IterationRecord,
): Promise<VideoState> {
  const next = await updateState(videoId, (s) => {
    s.iterations.push(iter);
    renumberIterations(s);
    return s;
  });
  // The pushed iter's index may have been renumbered; emit the canonical one.
  const canonical = next.iterations.find((i) => i.id === iter.id) ?? iter;
  emitIterationUpdate(videoId, canonical);
  emitVideoUpdate(next);
  return next;
}

async function patchIteration(
  videoId: string,
  iterId: string,
  patch: Partial<IterationRecord>,
): Promise<{ state: VideoState; iteration: IterationRecord }> {
  let updated: IterationRecord | null = null;
  const next = await updateState(videoId, (s) => {
    const i = s.iterations.findIndex((x) => x.id === iterId);
    if (i < 0) throw new Error("missing iteration");
    s.iterations[i] = { ...s.iterations[i], ...patch };
    updated = s.iterations[i];
    return s;
  });
  if (updated) emitIterationUpdate(videoId, updated);
  emitVideoUpdate(next);
  return { state: next, iteration: updated! };
}

async function setStage(
  videoId: string,
  iterId: string,
  state: IterationState,
) {
  return patchIteration(videoId, iterId, { state });
}

function checkCancelled(videoId: string): boolean {
  return cancelled.has(videoId);
}

/**
 * The Three.js generation track is opt-in via the analyzer's
 * `recommended_technique` field — anything else stays on the GLSL fragment
 * track. This is the single mapping from technique → runtime kind.
 */
function techniqueToKind(t: ShaderTechnique | undefined): IterationKind {
  return t === "three_scene" ? "three_scene" : "fragment";
}

export async function startIteration(
  input: StartIterationInput,
): Promise<IterationRecord> {
  if (isRunning(input.videoId)) {
    throw new Error("an iteration is already running for this video");
  }

  const state = await readState(input.videoId);
  if (!state) throw new Error(`unknown video ${input.videoId}`);

  const iter: IterationRecord = {
    id: newIterationId(),
    // Placeholder; pushIteration renumbers all iterations on insert.
    index: 0,
    parent_id: input.parentIterationId,
    state: "queued",
    failure_reason: null,
    // kind is set in runIteration once the analysis (or pivot override) is
    // resolved; until then there's no shader_code to render either, so the
    // UI status-message branch covers the in-progress window.
    shader_code: "",
    diagnosis: null,
    scores: null,
    prompts: { generation: "", diagnosis: "" },
    models: {
      analysis_model: MODELS.analysis,
      generation_model: MODELS.generation,
      diagnosis_model: MODELS.diagnosis,
    },
    compile: { status: "failed", log: "", repair_attempts: 0 },
    capture: {
      viewport: [512, 512],
      device_scale_factor: 1,
      webgl_version: 2,
      timestamps: [],
    },
    comparison_frames: [],
    created_at: nowIso(),
    completed_at: null,
  };
  await pushIteration(input.videoId, iter);

  const promise = (async () => {
    try {
      await runIteration(input.videoId, iter.id, input);
    } catch (err: any) {
      console.error("iteration failed", err);
      await patchIteration(input.videoId, iter.id, {
        state: "failed",
        failure_reason: "runtime_failed",
        compile: { status: "failed", log: String(err?.stack || err), repair_attempts: 0 },
        completed_at: nowIso(),
      });
    } finally {
      inflight.delete(input.videoId);
      cancelled.delete(input.videoId);
    }
  })();
  inflight.set(input.videoId, promise);
  return iter;
}

async function runIteration(
  videoId: string,
  iterId: string,
  input: StartIterationInput,
) {
  await setStage(videoId, iterId, "analyzing");

  let state = await readState(videoId);
  if (!state) throw new Error("missing state");

  // 1. Always extract source frames at the canonical timestamps for this
  //    iteration. Source extraction is cheap (a handful of ffmpeg seeks) and
  //    must align with whatever density extractionTimestamps currently returns
  //    — otherwise rendered-vs-source pair indexing would silently drift.
  const sourceTimestamps = extractionTimestamps(state.metadata.duration);
  const sourceFramePaths = await extractFramesAtTimes(
    videoId,
    sourceTimestamps,
    "source",
    state.metadata.duration,
  );
  // Run analysis only when missing — that's the expensive Claude call.
  if (!state.analysis.initial) {
    const { analysis } = await analyzeVideo(
      sourceFramePaths,
      state.metadata.duration,
    );
    state = await updateState(videoId, (s) => {
      s.analysis.initial = analysis;
      s.analysis.frames_used = sourceFramePaths.map((p) =>
        path.relative(process.cwd(), p),
      );
      return s;
    });
    emitVideoUpdate(state);
  }
  if (checkCancelled(videoId)) return cancelOut(videoId, iterId);

  const rawAnalysis = state.analysis.edited ?? state.analysis.initial!;
  const priorIteration = parentFor(state, input.parentIterationId);
  const priorDiagnosis = priorIteration?.diagnosis ?? null;
  const diagnosisPivot =
    !!priorDiagnosis &&
    priorDiagnosis.recommended_action === "pivot" &&
    !!priorDiagnosis.new_strategy?.recommended_technique &&
    !!priorIteration?.shader_code;
  const userPivot = !!input.forcePivot && !!priorIteration?.shader_code;
  const isPivot = diagnosisPivot || userPivot;

  // Pick the replacement technique (if any):
  //  - User-supplied technique from the "pick from a list" modal wins.
  //  - Otherwise fall back to the diagnosis's recommendation when the
  //    diagnosis voted to pivot.
  //  - Otherwise (e.g. "Let Claude pick" with no diagnosis recommendation),
  //    leave it undefined — claude.ts will instruct the model to pick a
  //    technique that differs from the rejected code.
  const pivotTechnique: ShaderTechnique | undefined = isPivot
    ? input.pivotTechnique ??
      (diagnosisPivot
        ? priorDiagnosis!.new_strategy!.recommended_technique
        : undefined)
    : undefined;

  // When we have a concrete replacement technique, override the analysis's
  // recommended technique so the generation prompt is internally consistent.
  const analysis =
    isPivot && pivotTechnique
      ? {
          ...rawAnalysis,
          shader_strategy: {
            ...rawAnalysis.shader_strategy,
            recommended_technique: pivotTechnique,
          },
        }
      : rawAnalysis;

  // 2. Generate (with up to 3 compile-repair attempts)
  await setStage(videoId, iterId, "generating");
  const compileErrors: string[] = [];
  // Pivoting: drop the prior shader as a continuation base; pass it as a
  // rejected counter-example instead.
  let priorCode = isPivot ? null : (priorIteration?.shader_code ?? null);
  const pivotReason = userPivot
    ? input.pivotHint
      ? "User judged the previous approach to be wrong and provided a hint about what to try instead."
      : "User judged the previous approach to be wrong and asked for a different approach."
    : (priorDiagnosis?.pivot_reason ?? "(no reason recorded)");
  const pivotRationale =
    pivotTechnique && diagnosisPivot && !input.pivotTechnique
      ? priorDiagnosis!.new_strategy!.rationale
      : pivotTechnique && input.pivotTechnique
        ? "User picked this technique explicitly."
        : undefined;
  const pivotContext = isPivot
    ? {
        rejectedCode: priorIteration!.shader_code,
        reason: pivotReason,
        newTechnique: pivotTechnique,
        rationale: pivotRationale,
        userHint: input.pivotHint,
      }
    : undefined;
  let lastPrompt = "";
  let shaderCode = "";
  let compileLog = "";
  let compiled = false;
  // Derive the runtime kind from the resolved technique (which already has
  // any pivot override applied above). Patch it onto the iter so the UI and
  // capture path see the right value once shader_code lands.
  const iterKind: IterationKind = techniqueToKind(
    analysis.shader_strategy.recommended_technique,
  );
  await patchIteration(videoId, iterId, { kind: iterKind });
  for (let attempt = 0; attempt < 4; attempt++) {
    if (checkCancelled(videoId)) return cancelOut(videoId, iterId);
    const stage: IterationState =
      attempt === 0 ? "generating" : "compiling";
    await patchIteration(videoId, iterId, { state: stage });

    const gen = await generateShader({
      analysis,
      priorDiagnosis: priorDiagnosis,
      priorCode,
      pivot: pivotContext,
      compileErrors,
      iterationIndex: priorIteration ? priorIteration.index + 1 : 1,
      preset: input.preset,
      kind: iterKind,
    });
    shaderCode = gen.code;
    lastPrompt = gen.prompt;

    const result =
      iterKind === "three_scene"
        ? await compileThreeInPlaywright(input.baseUrl, shaderCode)
        : await (async () => {
            const assembled = assembleShader(shaderCode);
            return compileInPlaywright(assembled.vertex, assembled.fragment);
          })();
    compileLog = result.log;
    if (result.ok) {
      compiled = true;
      await patchIteration(videoId, iterId, {
        shader_code: shaderCode,
        prompts: { generation: lastPrompt, diagnosis: "" },
        compile: { status: "success", log: compileLog, repair_attempts: attempt },
        state: "compiling",
      });
      break;
    }
    compileErrors.push(result.log);
    await patchIteration(videoId, iterId, {
      shader_code: shaderCode,
      prompts: { generation: lastPrompt, diagnosis: "" },
      compile: { status: "failed", log: compileLog, repair_attempts: attempt + 1 },
      state: "compiling",
    });
    if (attempt === 3) {
      await patchIteration(videoId, iterId, {
        state: "failed",
        failure_reason: "compile_failed",
        completed_at: nowIso(),
      });
      return;
    }
  }
  if (!compiled) {
    return;
  }

  // 3. Capture
  await setStage(videoId, iterId, "capturing");
  if (checkCancelled(videoId)) return cancelOut(videoId, iterId);

  const dur = state.metadata.duration;
  const timestamps = extractionTimestamps(dur);
  const capture = await capturePlayedFrames({
    videoId,
    iterationId: iterId,
    iterationIndex: priorIteration ? priorIteration.index + 1 : 1,
    duration: dur,
    timestamps,
    baseUrl: input.baseUrl,
  });

  if (capture.errors.length && capture.paths.length === 0) {
    await patchIteration(videoId, iterId, {
      state: "failed",
      failure_reason: "runtime_failed",
      compile: { status: "failed", log: capture.errors.join("\n"), repair_attempts: 0 },
      completed_at: nowIso(),
    });
    return;
  }
  const blank = await detectBlankness(capture.paths);
  if (blank) {
    await patchIteration(videoId, iterId, {
      state: "failed",
      failure_reason: "blank_output",
      completed_at: nowIso(),
    });
    return;
  }

  // Pair source/rendered by index
  const sourceFrames = await listSourceFrames(videoId);
  const pairs: ComparisonFrame[] = [];
  const root = process.cwd();
  for (let i = 0; i < timestamps.length; i++) {
    const src = sourceFrames[i];
    const rnd = capture.paths[i];
    if (src && rnd) {
      pairs.push({
        t: timestamps[i],
        source: path.relative(root, src),
        rendered: path.relative(root, rnd),
      });
    }
  }
  await patchIteration(videoId, iterId, {
    comparison_frames: pairs,
    capture: {
      viewport: [capture.width, capture.height],
      device_scale_factor: 1,
      webgl_version: 2,
      timestamps,
    },
  });

  // 4. Score
  await setStage(videoId, iterId, "scoring");
  if (checkCancelled(videoId)) return cancelOut(videoId, iterId);
  const scoring = await scoreIteration(
    pairs.map((p) => ({
      t: p.t,
      source: path.join(root, p.source),
      rendered: path.join(root, p.rendered),
    })),
  );
  await patchIteration(videoId, iterId, {
    scores: {
      lpips_distance: scoring.lpips_distance,
      lpips_score: scoring.lpips_score,
      optical_flow_correlation: scoring.optical_flow_correlation,
      loop_continuity_distance: scoring.loop_continuity_distance,
      loop_continuity_score: scoring.loop_continuity_score,
      combined: scoring.combined,
    },
  });

  // 5. Diagnose (best-effort — failures are recorded as diagnosis_status: "error"
  //    and surfaced in the UI with a "Regenerate diagnosis" affordance)
  await runDiagnosis(videoId, iterId, {
    pairs,
    rootDir: root,
    scoring,
    shaderCode,
    kind: iterKind,
    generationPrompt: lastPrompt,
  });

  await patchIteration(videoId, iterId, {
    state: "done",
    completed_at: nowIso(),
  });

  // Update best_iteration_id (verdict-first ranking; combined as tiebreaker).
  const final = await updateState(videoId, (s) => {
    s.best_iteration_id = pickBestIterationId(s);
    return s;
  });
  emitVideoUpdate(final);
}

export function pickBestIterationId(state: VideoState): string | null {
  const done = state.iterations.filter((i) => i.state === "done" && i.scores);
  if (done.length === 0) return null;
  return done.reduce((best, cur) =>
    cur.scores!.combined > best.scores!.combined ? cur : best,
  ).id;
}

/**
 * Run vision-diagnosis on an iteration, writing back diagnosis + status (ok|error).
 * Used by both the main run loop and the standalone "Regenerate diagnosis" endpoint.
 */
export async function runDiagnosis(
  videoId: string,
  iterId: string,
  input: {
    pairs: { t: number; source: string; rendered: string }[];
    rootDir: string;
    scoring: {
      lpips_distance: number;
      lpips_score: number;
      optical_flow_correlation: number;
      loop_continuity_distance: number;
      loop_continuity_score: number;
      combined: number;
    };
    shaderCode: string;
    kind: IterationKind;
    /** Optional: when called from the main run loop we already have it. */
    generationPrompt?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sampledPairs = subsamplePairs(input.pairs, 24).map((p) => ({
      t: p.t,
      source: path.isAbsolute(p.source)
        ? p.source
        : path.join(input.rootDir, p.source),
      rendered: path.isAbsolute(p.rendered)
        ? p.rendered
        : path.join(input.rootDir, p.rendered),
    }));
    const { diagnosis, prompt } = await diagnoseIteration(sampledPairs, {
      scores: input.scoring,
      shader_code: input.shaderCode,
      kind: input.kind,
    });
    const patch: Partial<IterationRecord> = {
      diagnosis,
      diagnosis_status: "ok",
      diagnosis_error: undefined,
    };
    if (input.generationPrompt !== undefined) {
      patch.prompts = { generation: input.generationPrompt, diagnosis: prompt };
    } else {
      // Standalone regenerate: preserve the existing generation prompt, replace only diagnosis.
      const current = (await readState(videoId))?.iterations.find(
        (i) => i.id === iterId,
      );
      patch.prompts = {
        generation: current?.prompts?.generation ?? "",
        diagnosis: prompt,
      };
    }
    await patchIteration(videoId, iterId, patch);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("diagnosis failed", msg);
    await patchIteration(videoId, iterId, {
      diagnosis_status: "error",
      diagnosis_error: msg,
    });
    return { ok: false, error: msg };
  }
}

async function cancelOut(videoId: string, iterId: string) {
  await patchIteration(videoId, iterId, {
    state: "cancelled",
    completed_at: nowIso(),
  });
}

function parentFor(state: VideoState, parentId: string | null) {
  if (!parentId) {
    const done = state.iterations.filter(
      (i) => i.state === "done" && i.scores,
    );
    if (done.length === 0) return null;
    return done.reduce((a, b) =>
      b.scores!.combined > a.scores!.combined ? b : a,
    );
  }
  return state.iterations.find((i) => i.id === parentId) ?? null;
}

async function listSourceFrames(videoId: string): Promise<string[]> {
  const dir = videoFramesDir(videoId);
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  return entries
    .filter((f) => f.startsWith("source_") && f.endsWith(".png"))
    .sort()
    .map((f) => path.join(dir, f));
}

function subsamplePairs<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.floor((i * arr.length) / n)]);
  }
  if (out[out.length - 1] !== arr[arr.length - 1]) {
    out[out.length - 1] = arr[arr.length - 1];
  }
  return out;
}

// Compile a candidate shader inside Playwright's WebGL2 context. This catches
// driver-level issues that node-side compilation tools (headless-gl, etc.) miss.
async function compileInPlaywright(
  vertex: string,
  fragment: string,
): Promise<{ ok: boolean; log: string }> {
  const { chromium } = await import("playwright");
  const browser = await getCompileBrowser();
  const context = await browser.newContext({
    viewport: { width: 64, height: 64 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html><body><canvas id="c" width="64" height="64"></canvas></body></html>`,
    );
    const result = (await page.evaluate(
      ({ vs, fs }) => {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        const gl = canvas.getContext("webgl2");
        if (!gl) return { ok: false, log: "WebGL2 unavailable" };
        function compile(type: number, src: string) {
          const sh = gl!.createShader(type)!;
          gl!.shaderSource(sh, src);
          gl!.compileShader(sh);
          if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
            const log = gl!.getShaderInfoLog(sh) || "(no log)";
            return { sh, log };
          }
          return { sh, log: "" };
        }
        const v = compile(gl.VERTEX_SHADER, vs);
        if (v.log) return { ok: false, log: `vertex: ${v.log}` };
        const f = compile(gl.FRAGMENT_SHADER, fs);
        if (f.log) return { ok: false, log: `fragment: ${f.log}` };
        const p = gl.createProgram()!;
        gl.attachShader(p, v.sh);
        gl.attachShader(p, f.sh);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
          const log = gl.getProgramInfoLog(p) || "(link error)";
          return { ok: false, log: `link: ${log}` };
        }
        return { ok: true, log: "" };
      },
      { vs: vertex, fs: fragment },
    )) as { ok: boolean; log: string };
    return result;
  } finally {
    await context.close();
  }
}

let compileBrowserPromise: Promise<import("playwright").Browser> | null = null;
async function getCompileBrowser() {
  if (!compileBrowserPromise) {
    const { chromium } = await import("playwright");
    compileBrowserPromise = chromium.launch({
      args: ["--use-gl=swiftshader", "--enable-webgl", "--no-sandbox"],
    });
  }
  return compileBrowserPromise;
}

/**
 * Compile-and-init gate for Three.js scene bodies. Navigates Playwright to
 * the Next.js `/three-compile-gate` page (which has THREE bundled), then
 * evaluates `window.runGate(body)`. Mirrors compileInPlaywright but cannot
 * use page.setContent because the gate needs the Next.js bundler for THREE.
 */
async function compileThreeInPlaywright(
  baseUrl: string,
  body: string,
): Promise<{ ok: boolean; log: string }> {
  const browser = await getCompileBrowser();
  const context = await browser.newContext({
    viewport: { width: 64, height: 64 },
    deviceScaleFactor: 1,
    ...(process.env.APP_PASSWORD
      ? {
          httpCredentials: {
            username: process.env.APP_USERNAME ?? "demo",
            password: process.env.APP_PASSWORD,
          },
        }
      : {}),
  });
  try {
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.goto(`${baseUrl}/three-compile-gate`, {
      waitUntil: "domcontentloaded",
    });
    try {
      await page.waitForFunction(
        () => (window as unknown as { __gateReady?: boolean }).__gateReady === true,
        { timeout: 15_000 },
      );
    } catch {
      return { ok: false, log: "three-compile-gate did not become ready" };
    }
    const result = (await page.evaluate(async (b: string) => {
      const fn = (window as unknown as { runGate?: (b: string) => Promise<{ ok: boolean; log: string }> }).runGate;
      if (!fn) return { ok: false, log: "runGate not defined on window" };
      return fn(b);
    }, body)) as { ok: boolean; log: string };
    if (!result.ok) return result;
    // Surface any page errors that occurred during gate execution but weren't thrown.
    if (pageErrors.length) {
      return { ok: false, log: pageErrors.join("\n") };
    }
    return result;
  } finally {
    await context.close();
  }
}
