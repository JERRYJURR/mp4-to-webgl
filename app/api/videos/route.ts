import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { listVideoStates, writeState } from "@/lib/persist";
import { newVideoId } from "@/lib/id";
import {
  generateThumbnail,
  probeVideo,
  transcodeIfNeeded,
} from "@/lib/pipeline/ffmpeg";
import {
  videoDir,
  videoFramesDir,
  videoSourcePath,
  videoThumbnailPath,
} from "@/lib/paths";
import type { VideoListItem, VideoState } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const states = await listVideoStates();
  const items: VideoListItem[] = states
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .map((s) => ({
      video_id: s.video_id,
      filename: s.filename,
      thumbnail_path: s.thumbnail_path,
      source_path: s.source_path,
      iteration_count: s.iterations.filter((i) => i.state === "done").length,
      best_iteration_id: s.best_iteration_id,
      is_sample: !!(s as any).is_sample,
    }));
  return NextResponse.json({ videos: items });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".mp4")) {
    return NextResponse.json(
      { error: "only .mp4 supported" },
      { status: 400 },
    );
  }

  const id = newVideoId();
  await fs.mkdir(videoDir(id), { recursive: true });
  await fs.mkdir(videoFramesDir(id), { recursive: true });

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(videoSourcePath(id), buf);

  const probe = await probeVideo(id);
  await transcodeIfNeeded(id, probe.codec);
  await generateThumbnail(id);

  const state: VideoState = {
    video_id: id,
    filename: file.name,
    source_path: path.relative(process.cwd(), videoSourcePath(id)),
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
  await writeState(state);

  return NextResponse.json({ video_id: id });
}
