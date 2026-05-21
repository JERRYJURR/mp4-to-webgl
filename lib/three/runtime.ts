import * as THREE from "three";

/**
 * Runtime for Claude-authored Three.js scene bodies.
 *
 * Contract for the `sceneBody` string:
 *   It is the *body* of a function with signature
 *     (THREE, ctx) => { scene, camera, update?, dispose? }
 *   where:
 *     - THREE  is the namespace (no imports required in the body),
 *     - ctx    is { width, height, duration } in pixels and seconds,
 *     - update is called every frame with (t, dt) — t is (elapsed % duration)
 *              in seconds, dt is delta since the previous frame (0 on init),
 *     - dispose is called when the runtime stops; use it to release
 *               geometries/materials/textures the scene allocates.
 *
 * The runtime owns the renderer, the raf loop, and canvas sizing.
 */

export interface ThreeRuntimeOptions {
  canvas: HTMLCanvasElement;
  sceneBody: string;
  duration: number;
  preserveDrawingBuffer?: boolean;
  onError?: (log: string) => void;
  onReady?: () => void;
}

export interface ThreeRuntimeHandle {
  stop(): void;
  renderOnce(t: number): void;
  setSize(width: number, height: number): void;
}

interface BuildSceneResult {
  scene: THREE.Scene;
  camera: THREE.Camera;
  update?: (t: number, dt: number) => void;
  dispose?: () => void;
}

function buildSceneFromBody(
  body: string,
  ctx: { width: number; height: number; duration: number },
): BuildSceneResult {
  const fn = new Function("THREE", "ctx", body) as (
    T: typeof THREE,
    c: typeof ctx,
  ) => BuildSceneResult;
  const result = fn(THREE, ctx);
  if (!result || !result.scene || !result.camera) {
    const keys = result ? Object.keys(result).join(", ") : "(nothing)";
    throw new Error(
      `buildScene must return { scene, camera, update? } — got: ${keys}`,
    );
  }
  return result;
}

export function createThreeRuntime(
  options: ThreeRuntimeOptions,
): ThreeRuntimeHandle | null {
  const {
    canvas,
    sceneBody,
    duration,
    preserveDrawingBuffer = false,
    onError,
    onReady,
  } = options;

  let renderer: THREE.WebGLRenderer | null = null;
  let built: BuildSceneResult | null = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.setClearColor(0x000000, 1);

    built = buildSceneFromBody(sceneBody, {
      width: canvas.width,
      height: canvas.height,
      duration,
    });
  } catch (err) {
    onError?.(formatError(err));
    renderer?.dispose();
    return null;
  }

  const scene = built.scene;
  const camera = built.camera;
  const update = built.update;
  const userDispose = built.dispose;

  let raf = 0;
  let start = performance.now();
  let externalTime: number | null = null;
  let lastT = 0;
  let stopped = false;
  const runningDuration = Math.max(0.001, duration);

  function frame() {
    if (stopped || !renderer) return;
    const now = performance.now();
    const t =
      externalTime != null
        ? externalTime
        : ((now - start) / 1000) % runningDuration;
    const dt = Math.max(0, t - lastT);
    lastT = t;
    try {
      update?.(t, dt);
      renderer.render(scene, camera);
    } catch (err) {
      onError?.(formatError(err));
      stopped = true;
      return;
    }
    if (externalTime == null) raf = requestAnimationFrame(frame);
  }

  function renderOnce(t: number) {
    // The constructor schedules an initial rAF for live playback. If we don't
    // cancel it here, that rAF fires AFTER this draw and redraws the canvas
    // at wall-clock time ≈ 0 — which is what Playwright then screenshots.
    // Every captured frame would otherwise look like the t≈0 frame regardless
    // of the requested t.
    cancelAnimationFrame(raf);
    externalTime = t;
    lastT = 0;
    frame();
    externalTime = null;
  }

  onReady?.();
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        userDispose?.();
      } catch {
        /* user dispose errors are non-fatal */
      }
      renderer?.dispose();
      renderer = null;
    },
    renderOnce,
    setSize(width: number, height: number) {
      if (!renderer) return;
      renderer.setSize(width, height, false);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      } else if (camera instanceof THREE.OrthographicCamera) {
        camera.updateProjectionMatrix();
      }
    },
  };
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  return String(err);
}
