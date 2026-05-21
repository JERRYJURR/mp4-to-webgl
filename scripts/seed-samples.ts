/**
 * Seed sample videos from videos/*.mp4 (the loose mp4 files you've collected).
 * Idempotent: skips samples that are already imported.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { newVideoId } from "../lib/id";
import {
  videoDir,
  videoFramesDir,
  videoSourcePath,
  videoStatePath,
  videoThumbnailPath,
  VIDEOS_DIR,
} from "../lib/paths";
import {
  generateThumbnail,
  probeVideo,
  transcodeIfNeeded,
} from "../lib/pipeline/ffmpeg";
import { listVideoStates, writeState } from "../lib/persist";
import type { VideoState } from "../lib/types";

async function main() {
  await fs.mkdir(VIDEOS_DIR, { recursive: true });
  const entries = await fs.readdir(VIDEOS_DIR);
  const looseMp4s = entries.filter(
    (e) => e.endsWith(".mp4") && !e.startsWith("."),
  );

  const existing = await listVideoStates();
  const knownFilenames = new Set(existing.map((s) => s.filename));

  for (const f of looseMp4s) {
    if (knownFilenames.has(f)) {
      console.log(`skip ${f} (already imported)`);
      continue;
    }
    const id = newVideoId();
    console.log(`importing ${f} → ${id}`);
    await fs.mkdir(videoDir(id), { recursive: true });
    await fs.mkdir(videoFramesDir(id), { recursive: true });
    const src = path.join(VIDEOS_DIR, f);
    const dst = videoSourcePath(id);
    await fs.copyFile(src, dst);
    const probe = await probeVideo(id);
    await transcodeIfNeeded(id, probe.codec);
    await generateThumbnail(id);
    const state: VideoState = {
      video_id: id,
      filename: f,
      source_path: path.relative(process.cwd(), dst),
      thumbnail_path: path.relative(process.cwd(), videoThumbnailPath(id)),
      metadata: {
        duration: probe.duration,
        framerate: probe.framerate,
        resolution: [probe.width, probe.height],
        rotation: probe.rotation,
        codec: probe.codec,
      },
      analysis: { initial: null, edited: null, frames_used: [] },
      iterations: [],
      best_iteration_id: null,
      created_at: new Date().toISOString(),
    };
    (state as any).is_sample = true;
    await writeState(state);
  }

  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
