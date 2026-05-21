import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { readState, renumberIterations, updateState } from "@/lib/persist";
import { isRunning } from "@/lib/pipeline/orchestrator";
import { emitVideoUpdate } from "@/lib/events";
import { videoFramesDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ videoId: string; iterationId: string }> },
) {
  const { videoId, iterationId } = await context.params;
  const state = await readState(videoId);
  if (!state) return NextResponse.json({ error: "no such video" }, { status: 404 });
  const iter = state.iterations.find((i) => i.id === iterationId);
  if (!iter) return NextResponse.json({ error: "no such iteration" }, { status: 404 });

  const running = new Set([
    "queued",
    "analyzing",
    "generating",
    "compiling",
    "capturing",
    "scoring",
  ]);
  if (running.has(iter.state) && isRunning(videoId)) {
    return NextResponse.json(
      { error: "cancel before deleting a running iteration" },
      { status: 409 },
    );
  }

  // Remove rendered frame PNGs for this iteration. Pattern matches the prefix
  // the orchestrator writes: iter_{index}_{frame}.png.
  const framesDir = videoFramesDir(videoId);
  const prefix = `iter_${String(iter.index).padStart(3, "0")}_`;
  try {
    const entries = await fs.readdir(framesDir);
    await Promise.all(
      entries
        .filter((f) => f.startsWith(prefix))
        .map((f) => fs.unlink(path.join(framesDir, f)).catch(() => {})),
    );
  } catch {
    /* missing frames dir is fine */
  }

  const next = await updateState(videoId, (s) => {
    s.iterations = s.iterations.filter((i) => i.id !== iterationId);
    renumberIterations(s);
    if (s.best_iteration_id === iterationId) {
      const done = s.iterations.filter((i) => i.state === "done" && i.scores);
      s.best_iteration_id = done.length
        ? done.reduce((a, b) => (b.scores!.combined > a.scores!.combined ? b : a)).id
        : null;
    }
    return s;
  });
  emitVideoUpdate(next);
  return NextResponse.json({ ok: true });
}
