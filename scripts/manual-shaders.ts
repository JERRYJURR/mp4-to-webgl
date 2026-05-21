/**
 * Hand-coded "iterations" — pretends to be Claude. POSTs a shader for each
 * sample video through the manual endpoint so the overlay viewer has something
 * to play.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { VIDEOS_DIR } from "../lib/paths";

const SHADERS: Record<string, string> = {};

// --------------------------------------------------------------------------
// ink-flow.mp4 — black ink swirling in clear liquid, monochrome, thin tendrils.
// Strategy: 5-octave fbm in domain-warped space, threshold near mid-gray with
// a soft edge; phase advances slowly around u_loop_coord so it loops.
// --------------------------------------------------------------------------
SHADERS["ink-flow.mp4"] = `// ink-flow: domain-warped fbm sliced into ink tendrils
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += a * vnoise(p);
    p = r * p * 2.0;
    a *= 0.5;
  }
  return v;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * u_resolution.xy) / u_resolution.y;
  float tphase = u_loop_phase * 6.2831853;

  // periodic flow vector (so the field is the same at phase 0 and 1)
  vec2 driftA = vec2(cos(tphase), sin(tphase)) * 0.35;
  vec2 driftB = vec2(cos(tphase * 2.0 + 1.7), sin(tphase * 2.0 + 0.3)) * 0.18;

  vec2 q = uv * 1.6 + driftA;
  vec2 warp1 = vec2(fbm(q + 7.1), fbm(q + 3.7)) - 0.5;
  vec2 warp2 = vec2(fbm(q * 2.0 + warp1 * 2.0 + driftB), fbm(q * 2.0 + warp1 * 2.0 + 11.3)) - 0.5;
  float n = fbm(uv * 2.2 + warp1 * 1.8 + warp2 * 1.2 + driftA);

  // sharpen into ink-like tendrils
  float ink = smoothstep(0.55, 0.30, n);

  // micro detail / spotty pigment
  float specks = smoothstep(0.78, 0.86, fbm(uv * 18.0 + warp1 * 2.0));
  ink = clamp(ink + specks * 0.35, 0.0, 1.0);

  vec3 paper = vec3(0.96, 0.95, 0.92);
  vec3 ink_color = vec3(0.04, 0.04, 0.05);
  vec3 col = mix(paper, ink_color, ink);

  // soft vignette to match camera look
  float r = length(uv);
  col *= smoothstep(1.20, 0.45, r);

  fragColor = vec4(col, 1.0);
}`;

// --------------------------------------------------------------------------
// underwater.mp4 — soft teal/cyan caustics, very smooth low-frequency motion.
// Strategy: layered sin-wave caustics with hash-based noise on top, drifting.
// --------------------------------------------------------------------------
SHADERS["underwater.mp4"] = `// underwater: smooth caustic shimmer over a deep teal gradient
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 31.7);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + 11.3;
    a *= 0.5;
  }
  return v;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * u_resolution.xy) / u_resolution.y;
  float t = u_loop_phase * 6.2831853;

  // periodic drift in 2D — guarantees seamless loop
  vec2 drift = vec2(cos(t), sin(t)) * 0.45 + vec2(cos(t * 2.0 + 0.7), sin(t * 2.0)) * 0.18;

  // base color: deep cyan at bottom, paler near top, light leak top-center
  vec3 deep    = vec3(0.12, 0.30, 0.40);
  vec3 mid     = vec3(0.35, 0.62, 0.62);
  vec3 highlight = vec3(0.90, 0.96, 0.86);
  float vert = clamp(0.5 - uv.y * 0.7, 0.0, 1.0);
  vec3 base = mix(deep, mid, vert);

  // soft caustic web from intersecting sinusoidal bands warped by fbm
  vec2 p = uv * 1.5 + drift;
  float n = fbm(p * 1.5);
  float caustic =
    sin((p.x + n * 1.5) * 6.2831 + t) *
    sin((p.y + n * 1.2) * 6.2831 - t);
  caustic = pow(clamp(0.5 + 0.5 * caustic, 0.0, 1.0), 3.0);

  // upper-left light leak that swings slowly
  vec2 leakPos = vec2(-0.45 + 0.18 * cos(t), 0.50 + 0.10 * sin(t));
  float leak = exp(-2.3 * length(uv - leakPos));

  vec3 col = base;
  col += caustic * vec3(0.35, 0.45, 0.40);
  col = mix(col, highlight, leak * 0.85);

  // gentle soft-focus blur feel via a tone curve
  col = pow(col, vec3(0.92));
  fragColor = vec4(col, 1.0);
}`;

// --------------------------------------------------------------------------
// wavy-shapes.mp4 — off-white paper-cut layered bands, soft shadows, minimal.
// Strategy: 3 stratified domain-warped bands stacked with subtle drop shadows.
// --------------------------------------------------------------------------
SHADERS["wavy-shapes.mp4"] = `// wavy-shapes: off-white layered paper bands with soft shadows
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.31);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 7.3;
    a *= 0.5;
  }
  return v;
}
// drifting wavy threshold per band
float bandShape(vec2 uv, float yBase, float freq, float phaseOff, float t) {
  float drift = sin(t + phaseOff) * 0.08;
  float wave = sin(uv.x * freq + t + phaseOff) * 0.10
             + fbm(vec2(uv.x * 0.8 + drift, phaseOff)) * 0.18 - 0.09;
  return uv.y - (yBase + wave);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution.xy;
  uv -= 0.5;
  uv.x *= u_resolution.x / u_resolution.y;
  float t = u_loop_phase * 6.2831853;

  vec3 paper0 = vec3(0.97, 0.97, 0.96);
  vec3 paper1 = vec3(0.93, 0.93, 0.93);
  vec3 paper2 = vec3(0.88, 0.88, 0.89);
  vec3 paper3 = vec3(0.82, 0.83, 0.85);

  vec3 col = paper0;

  // 3 stacked wavy strata from top to bottom
  float b1 = bandShape(uv, -0.10, 4.5, 1.1, t);
  float b2 = bandShape(uv, -0.02, 3.2, 2.6, t);
  float b3 = bandShape(uv,  0.12, 5.6, 0.4, t);

  // soft drop shadow band beneath each edge
  float sh1 = smoothstep(-0.025, 0.0, b1) * (1.0 - smoothstep(0.0, 0.02, b1));
  float sh2 = smoothstep(-0.025, 0.0, b2) * (1.0 - smoothstep(0.0, 0.02, b2));
  float sh3 = smoothstep(-0.025, 0.0, b3) * (1.0 - smoothstep(0.0, 0.02, b3));

  col = mix(col, paper1, smoothstep(0.0, 0.002, b1));
  col = mix(col, paper2, smoothstep(0.0, 0.002, b2));
  col = mix(col, paper3, smoothstep(0.0, 0.002, b3));

  // edge shadows
  col -= 0.06 * (sh1 + sh2 + sh3);

  // subtle paper grain
  float grain = fbm(uv * 80.0) - 0.5;
  col += grain * 0.012;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// --------------------------------------------------------------------------
// 3d-boxes.mp4 — orange backdrop with cube cluster. Full procedural cubes are
// out of scope for a one-shot; produce a stand-in: orange radial glow with a
// pulsing cube-like grid pattern.
// --------------------------------------------------------------------------
SHADERS["3d-boxes.mp4"] = `// 3d-boxes (stand-in): pulsing orange cube grid against warm gradient
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * u_resolution.xy) / u_resolution.y;
  float t = u_loop_phase * 6.2831853;

  // warm orange backdrop with radial fall-off
  vec3 a = vec3(0.97, 0.55, 0.18);
  vec3 b = vec3(0.94, 0.36, 0.12);
  float r = length(uv);
  vec3 bg = mix(a, b, smoothstep(0.0, 1.2, r));

  // gentle camera rotation
  float ang = sin(t) * 0.18;
  float ca = cos(ang), sa = sin(ang);
  vec2 q = mat2(ca, -sa, sa, ca) * uv;

  // cube cluster: grid of squares of varying brightness that bob with t
  vec3 col = bg;
  for (int j = 0; j < 6; j++) {
    float fj = float(j);
    vec2 cellSize = vec2(0.18 + 0.02 * fj);
    vec2 grid = floor(q / cellSize);
    vec2 cellUV = fract(q / cellSize) - 0.5;

    float h = hash21(grid + fj * 7.13);
    float bob = sin(t + h * 6.2831 + fj) * 0.5 + 0.5;
    float size = 0.18 + 0.18 * bob;

    float box = max(abs(cellUV.x), abs(cellUV.y));
    float mask = smoothstep(size + 0.01, size - 0.01, box);

    // discard far cells so the cluster feels finite
    float clusterFalloff = exp(-2.2 * length(grid * cellSize));
    mask *= clusterFalloff;

    vec3 face = mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.42, 0.18), h);
    face *= mix(0.7, 1.05, bob);
    col = mix(col, face, mask * 0.85);
  }

  // light vignette
  col *= smoothstep(1.40, 0.55, r);
  fragColor = vec4(col, 1.0);
}`;

async function main() {
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const states = await fs.readdir(VIDEOS_DIR);
  for (const dir of states) {
    const statePath = path.join(VIDEOS_DIR, dir, "state.json");
    let raw: string;
    try {
      raw = await fs.readFile(statePath, "utf8");
    } catch {
      continue;
    }
    const state = JSON.parse(raw) as { video_id: string; filename: string };
    const code = SHADERS[state.filename];
    if (!code) {
      console.log(`skip ${state.filename} (no shader written)`);
      continue;
    }
    console.log(`posting iteration for ${state.filename}`);
    const res = await fetch(`${base}/api/videos/${state.video_id}/iterations/manual`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shader_code: code, author: "claude-hand" }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`  failed: ${res.status} ${txt}`);
    } else {
      const j = (await res.json()) as any;
      console.log(`  ok: iteration ${j.iteration.index} -> ${j.iteration.id}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
