import { assembleShader } from "./scaffold";

export interface RuntimeOptions {
  canvas: HTMLCanvasElement;
  shaderBody: string;
  duration: number;
  preserveDrawingBuffer?: boolean;
  onCompileError?: (log: string) => void;
  onReady?: () => void;
}

export interface RuntimeHandle {
  stop(): void;
  setTime(t: number): void;
  setDuration(d: number): void;
  renderOnce(t: number): void;
}

export function compileShaderProgram(
  gl: WebGL2RenderingContext,
  vertexSrc: string,
  fragmentSrc: string,
): { program: WebGLProgram | null; log: string } {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vertexSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    const log = `Vertex shader: ${gl.getShaderInfoLog(vs) || ""}`;
    gl.deleteShader(vs);
    return { program: null, log };
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fragmentSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const log = `Fragment shader: ${gl.getShaderInfoLog(fs) || ""}`;
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return { program: null, log };
  }
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = `Program link: ${gl.getProgramInfoLog(program) || ""}`;
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return { program: null, log };
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return { program, log: "" };
}

export function createShaderRuntime(
  options: RuntimeOptions,
): RuntimeHandle | null {
  const {
    canvas,
    shaderBody,
    duration,
    preserveDrawingBuffer = false,
    onCompileError,
    onReady,
  } = options;

  const glOrNull = canvas.getContext("webgl2", {
    antialias: false,
    preserveDrawingBuffer,
    premultipliedAlpha: false,
  });
  if (!glOrNull) {
    onCompileError?.("WebGL2 unavailable");
    return null;
  }
  const gl: WebGL2RenderingContext = glOrNull;

  const { vertex, fragment } = assembleShader(shaderBody);
  const { program, log } = compileShaderProgram(gl, vertex, fragment);
  if (!program) {
    onCompileError?.(log);
    return null;
  }

  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, "u_time");
  const uDuration = gl.getUniformLocation(program, "u_duration");
  const uResolution = gl.getUniformLocation(program, "u_resolution");
  const uLoopPhase = gl.getUniformLocation(program, "u_loop_phase");
  const uLoopCoord = gl.getUniformLocation(program, "u_loop_coord");

  gl.useProgram(program);

  let runningDuration = Math.max(0.001, duration);
  let raf = 0;
  let start = performance.now();
  let externalTime: number | null = null;
  let stopped = false;

  function frame() {
    if (stopped) return;
    const w = canvas.width;
    const h = canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const t =
      externalTime != null
        ? externalTime
        : ((performance.now() - start) / 1000) % runningDuration;
    const phase = (t % runningDuration) / runningDuration;
    gl.uniform1f(uTime, t);
    gl.uniform1f(uDuration, runningDuration);
    gl.uniform2f(uResolution, w, h);
    gl.uniform1f(uLoopPhase, phase);
    gl.uniform2f(uLoopCoord, Math.cos(phase * Math.PI * 2), Math.sin(phase * Math.PI * 2));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
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
    frame();
    externalTime = null;
  }

  onReady?.();
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    },
    setTime(t: number) {
      externalTime = t;
      frame();
      externalTime = null;
    },
    setDuration(d: number) {
      runningDuration = Math.max(0.001, d);
      start = performance.now();
    },
    renderOnce,
  };
}
