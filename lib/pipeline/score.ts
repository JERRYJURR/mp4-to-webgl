// server-only enforced by Next.js route boundary
import { downsampleLuma, downsampleRgb, readPng } from "./png";
import type { Scores } from "../types";

interface PairInputs {
  source: string;
  rendered: string;
  t: number;
}

const SIZE = 32;

async function lumaFor(path: string) {
  const { rgba, width, height } = await readPng(path);
  return downsampleLuma(rgba, width, height, SIZE);
}

async function rgbFor(path: string) {
  const { rgba, width, height } = await readPng(path);
  return downsampleRgb(rgba, width, height, SIZE);
}

function l2(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s / n);
}

function ssimLike(a: Float32Array, b: Float32Array): number {
  // Local-mean similarity in 8x8 patches — cheap structural proxy
  const block = 8;
  const stride = SIZE;
  let sum = 0;
  let count = 0;
  for (let by = 0; by < SIZE - block + 1; by += block) {
    for (let bx = 0; bx < SIZE - block + 1; bx += block) {
      let ma = 0,
        mb = 0,
        va = 0,
        vb = 0,
        cov = 0,
        n = 0;
      for (let y = 0; y < block; y++) {
        for (let x = 0; x < block; x++) {
          const i = (by + y) * stride + (bx + x);
          ma += a[i];
          mb += b[i];
          n++;
        }
      }
      ma /= n;
      mb /= n;
      for (let y = 0; y < block; y++) {
        for (let x = 0; x < block; x++) {
          const i = (by + y) * stride + (bx + x);
          const da = a[i] - ma;
          const db = b[i] - mb;
          va += da * da;
          vb += db * db;
          cov += da * db;
        }
      }
      va /= n;
      vb /= n;
      cov /= n;
      const c1 = 0.0001;
      const c2 = 0.0009;
      const numerator = (2 * ma * mb + c1) * (2 * cov + c2);
      const denominator = (ma * ma + mb * mb + c1) * (va + vb + c2);
      sum += numerator / Math.max(1e-9, denominator);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function flowMagnitude(a: Float32Array, b: Float32Array): number {
  // Mean |b-a| — proxy for "motion magnitude" between consecutive frames.
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(b[i] - a[i]);
  return s / n;
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let ma = 0,
    mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  if (denom < 1e-9) return 0;
  return num / denom;
}

export interface ScoringResult extends Scores {
  perPair: { t: number; perceptual_distance: number; ssim_like: number }[];
  notes: string[];
}

/**
 * Default weights. An earlier recalibration set these to 0.45/0.5/0.05 based
 * on observed score distributions, but those observations were made when the
 * capture path had a rAF-race bug that screenshotted every rendered frame at
 * t≈0 — so loop_continuity looked near-saturated and lpips/flow looked noisy.
 * The bug is fixed now; reverting to the original weights until fresh data
 * suggests a different mix is actually appropriate.
 */
export async function scoreIteration(
  pairs: PairInputs[],
  weights: { lpips: number; flow: number; loop: number } = {
    lpips: 0.4,
    flow: 0.4,
    loop: 0.2,
  },
): Promise<ScoringResult> {
  if (pairs.length === 0) {
    return {
      lpips_distance: 1,
      lpips_score: 0,
      optical_flow_correlation: 0,
      loop_continuity_distance: 1,
      loop_continuity_score: 0,
      combined: 0,
      perPair: [],
      notes: ["no pairs"],
    };
  }

  // Sort by time so flow comparisons are sensible
  const sorted = [...pairs].sort((a, b) => a.t - b.t);

  const sourceLuma: Float32Array[] = [];
  const renderedLuma: Float32Array[] = [];
  const sourceRgb: Float32Array[] = [];
  const renderedRgb: Float32Array[] = [];

  for (const p of sorted) {
    sourceLuma.push(await lumaFor(p.source));
    renderedLuma.push(await lumaFor(p.rendered));
    sourceRgb.push(await rgbFor(p.source));
    renderedRgb.push(await rgbFor(p.rendered));
  }

  // Perceptual distance (LPIPS substitute): RGB L2 + (1 - ssim_like) on luma, averaged.
  const perPair = sorted.map((pair, i) => {
    const rgbDist = l2(sourceRgb[i], renderedRgb[i]);
    const ssim = ssimLike(sourceLuma[i], renderedLuma[i]);
    return {
      t: pair.t,
      perceptual_distance: rgbDist * 0.6 + (1 - ssim) * 0.4,
      ssim_like: ssim,
    };
  });
  const lpips_distance =
    perPair.reduce((s, p) => s + p.perceptual_distance, 0) / perPair.length;
  const lpips_score = Math.max(0, Math.min(1, 1 - lpips_distance));

  // Optical-flow proxy: correlate frame-to-frame motion magnitudes.
  const srcMag: number[] = [];
  const rndMag: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    srcMag.push(flowMagnitude(sourceLuma[i - 1], sourceLuma[i]));
    rndMag.push(flowMagnitude(renderedLuma[i - 1], renderedLuma[i]));
  }
  const optical_flow_correlation =
    srcMag.length > 1
      ? Math.max(0, (correlation(srcMag, rndMag) + 1) / 2)
      : 0.5;

  // Loop continuity — compare first & last rendered frame
  const first = renderedRgb[0];
  const last = renderedRgb[renderedRgb.length - 1];
  const loop_continuity_distance = l2(first, last);
  const loop_continuity_score = Math.max(
    0,
    Math.min(1, 1 - loop_continuity_distance),
  );

  const combined =
    weights.lpips * lpips_score +
    weights.flow * optical_flow_correlation +
    weights.loop * loop_continuity_score;

  return {
    lpips_distance,
    lpips_score,
    optical_flow_correlation,
    loop_continuity_distance,
    loop_continuity_score,
    combined,
    perPair,
    notes: [
      "perceptual distance is a JS-side proxy (rgb-L2 + ssim-like), not real LPIPS",
      "optical flow is correlated on luma-difference magnitudes, not OpenCV Farnebäck",
    ],
  };
}
