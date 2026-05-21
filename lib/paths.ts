import path from "node:path";

export const ROOT = process.cwd();
export const VIDEOS_DIR = path.join(ROOT, "videos");

export function videoDir(id: string) {
  return path.join(VIDEOS_DIR, id);
}

export function videoStatePath(id: string) {
  return path.join(videoDir(id), "state.json");
}

export function videoFramesDir(id: string) {
  return path.join(videoDir(id), "frames");
}

export function videoSourcePath(id: string) {
  return path.join(videoDir(id), "source.mp4");
}

export function videoThumbnailPath(id: string) {
  return path.join(videoDir(id), "thumbnail.png");
}
