import fs from "node:fs/promises";
import path from "node:path";
import {
  VIDEOS_DIR,
  videoDir,
  videoFramesDir,
  videoStatePath,
} from "./paths";
import type { VideoState } from "./types";

/**
 * Reassigns each iteration's `index` to its 1-based array position so the
 * list stays contiguous after additions, deletions, and renames. Call this
 * inside any updater that mutates the iterations array.
 */
export function renumberIterations(state: VideoState): void {
  state.iterations.forEach((it, i) => {
    it.index = i + 1;
  });
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readState(id: string): Promise<VideoState | null> {
  try {
    const buf = await fs.readFile(videoStatePath(id), "utf8");
    return JSON.parse(buf) as VideoState;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeState(state: VideoState): Promise<void> {
  const dir = videoDir(state.video_id);
  await ensureDir(dir);
  await ensureDir(videoFramesDir(state.video_id));
  const tmp = path.join(dir, "state.tmp.json");
  const target = videoStatePath(state.video_id);
  const data = JSON.stringify(state, null, 2);
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, target);
}

export async function updateState(
  id: string,
  updater: (state: VideoState) => VideoState | Promise<VideoState>,
): Promise<VideoState> {
  const existing = await readState(id);
  if (!existing) throw new Error(`Unknown video ${id}`);
  const next = await updater(existing);
  await writeState(next);
  return next;
}

export async function listVideoIds(): Promise<string[]> {
  await ensureDir(VIDEOS_DIR);
  const entries = await fs.readdir(VIDEOS_DIR, { withFileTypes: true });
  const ids: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    try {
      await fs.access(path.join(VIDEOS_DIR, id, "state.json"));
      ids.push(id);
    } catch {
      // skip directories without state.json
    }
  }
  return ids;
}

export async function listVideoStates(): Promise<VideoState[]> {
  const ids = await listVideoIds();
  const out: VideoState[] = [];
  for (const id of ids) {
    const s = await readState(id);
    if (s) out.push(s);
  }
  return out;
}
