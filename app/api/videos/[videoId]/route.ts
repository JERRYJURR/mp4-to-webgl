import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { readState } from "@/lib/persist";
import { isRunning } from "@/lib/pipeline/orchestrator";
import { videoDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const state = await readState(videoId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ state });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const state = await readState(videoId);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (isRunning(videoId)) {
    return NextResponse.json(
      { error: "an iteration is still running — wait for it to finish first" },
      { status: 409 },
    );
  }
  await fs.rm(videoDir(videoId), { recursive: true, force: true });
  return NextResponse.json({ ok: true });
}
