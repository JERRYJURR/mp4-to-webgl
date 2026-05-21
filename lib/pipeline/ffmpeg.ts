// server-only enforced by Next.js route boundary
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { videoFramesDir, videoSourcePath, videoThumbnailPath } from "../paths";

export const FFMPEG_BIN = ffmpegInstaller.path;
export const FFPROBE_BIN = ffprobeInstaller.path;

export interface ProbeResult {
  duration: number;
  framerate: number;
  width: number;
  height: number;
  rotation: number;
  codec: string;
}

function run(
  bin: string,
  args: string[],
  opts: { input?: Buffer } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => resolve({ stdout: out, stderr: err, code: code ?? 0 }));
    if (opts.input) p.stdin.end(opts.input);
  });
}

export async function probeVideo(videoId: string): Promise<ProbeResult> {
  const src = videoSourcePath(videoId);
  const { stdout, stderr, code } = await run(FFPROBE_BIN, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    src,
  ]);
  if (code !== 0) {
    throw new Error(`ffprobe failed: ${stderr}`);
  }
  const j = JSON.parse(stdout);
  const v = j.streams.find((s: any) => s.codec_type === "video");
  if (!v) throw new Error("no video stream");
  const duration = Number(j.format.duration ?? v.duration ?? 0);
  const r = (v.avg_frame_rate || v.r_frame_rate || "30/1").split("/");
  const fr = Number(r[0]) / Math.max(1, Number(r[1] ?? "1"));
  let rotation = 0;
  if (v.side_data_list) {
    const rot = v.side_data_list.find((s: any) => "rotation" in s);
    if (rot) rotation = Number(rot.rotation);
  }
  return {
    duration,
    framerate: fr,
    width: Number(v.width),
    height: Number(v.height),
    rotation,
    codec: String(v.codec_name || "unknown"),
  };
}

export function extractionTimestamps(
  duration: number,
  count = 24,
  epsilon = 0.05,
): number[] {
  if (duration <= 0) return [0];
  // Roughly one frame every ~0.5s, capped at `count` so very short videos
  // still get enough samples and very long ones don't explode the budget.
  const inner = Math.max(2, Math.min(count, Math.round(duration * 2) + 1));
  const out: number[] = [0];
  for (let i = 1; i < inner - 1; i++) {
    out.push((duration * i) / (inner - 1));
  }
  out.push(Math.max(0, duration - epsilon));
  return Array.from(new Set(out.map((x) => Number(x.toFixed(4)))));
}

async function extractOne(src: string, t: number, out: string): Promise<void> {
  const { code, stderr } = await run(FFMPEG_BIN, [
    "-y",
    "-ss",
    String(t),
    "-i",
    src,
    "-frames:v",
    "1",
    "-vf",
    "scale=512:512:force_original_aspect_ratio=increase,crop=512:512",
    "-q:v",
    "2",
    out,
  ]);
  if (code !== 0)
    throw new Error(`ffmpeg extract failed at t=${t}: ${stderr.slice(-400)}`);
}

export async function extractFramesAtTimes(
  videoId: string,
  times: number[],
  prefix: string,
  duration?: number,
): Promise<string[]> {
  const dir = videoFramesDir(videoId);
  await fs.mkdir(dir, { recursive: true });
  const src = videoSourcePath(videoId);
  const written: string[] = [];
  for (let i = 0; i < times.length; i++) {
    let t = times[i];
    const out = path.join(dir, `${prefix}_${String(i).padStart(3, "0")}.png`);
    await extractOne(src, t, out);
    // ffmpeg may exit 0 yet write nothing when seeking past the last decodable
    // frame near end-of-stream. Verify and retry with a safer offset.
    let stat = await fs.stat(out).catch(() => null);
    if ((!stat || stat.size === 0) && duration && t > duration / 2) {
      for (const fallback of [duration - 0.25, duration - 0.5, duration * 0.95]) {
        if (fallback <= 0) break;
        t = Math.max(0, fallback);
        await extractOne(src, t, out);
        stat = await fs.stat(out).catch(() => null);
        if (stat && stat.size > 0) break;
      }
    }
    if (!stat || stat.size === 0) {
      throw new Error(
        `ffmpeg produced no output for frame ${i} (originally requested t=${times[i]})`,
      );
    }
    written.push(out);
  }
  return written;
}

export async function generateThumbnail(
  videoId: string,
  atSeconds = 0.5,
): Promise<void> {
  const src = videoSourcePath(videoId);
  const out = videoThumbnailPath(videoId);
  await run(FFMPEG_BIN, [
    "-y",
    "-ss",
    String(atSeconds),
    "-i",
    src,
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-1",
    out,
  ]);
}

export async function transcodeIfNeeded(videoId: string, codec: string) {
  if (codec === "h264") return;
  const src = videoSourcePath(videoId);
  const tmp = src.replace(/\.mp4$/, ".tmp.mp4");
  const { code, stderr } = await run(FFMPEG_BIN, [
    "-y",
    "-i",
    src,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-an",
    tmp,
  ]);
  if (code !== 0) throw new Error(`transcode failed: ${stderr.slice(-400)}`);
  await fs.rename(tmp, src);
}
