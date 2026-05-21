import { NextResponse } from "next/server";
import { readState, updateState } from "@/lib/persist";
import { emitVideoUpdate } from "@/lib/events";
import {
  isRunning,
  pickBestIterationId,
  runDiagnosis,
} from "@/lib/pipeline/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 360;

/**
 * Re-run vision diagnosis on an existing iteration without re-capturing or
 * re-scoring. Used by the "Regenerate diagnosis" affordance in the UI for
 * iterations where diagnosis returned malformed JSON or threw.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ videoId: string; iterationId: string }> },
) {
  const { videoId, iterationId } = await context.params;

  if (isRunning(videoId)) {
    return NextResponse.json(
      { error: "an iteration is running for this video — wait for it to finish" },
      { status: 409 },
    );
  }

  const state = await readState(videoId);
  if (!state) return NextResponse.json({ error: "no such video" }, { status: 404 });
  const iter = state.iterations.find((i) => i.id === iterationId);
  if (!iter) {
    return NextResponse.json({ error: "no such iteration" }, { status: 404 });
  }
  if (iter.state !== "done") {
    return NextResponse.json(
      { error: `iteration is in state "${iter.state}" — diagnose runs after completion only` },
      { status: 400 },
    );
  }
  if (!iter.scores) {
    return NextResponse.json(
      { error: "iteration has no scores — re-running diagnosis without them isn't supported" },
      { status: 400 },
    );
  }
  if (iter.comparison_frames.length === 0) {
    return NextResponse.json(
      { error: "iteration has no captured frames — nothing to diagnose against" },
      { status: 400 },
    );
  }

  const result = await runDiagnosis(videoId, iterationId, {
    pairs: iter.comparison_frames.map((c) => ({
      t: c.t,
      source: c.source,
      rendered: c.rendered,
    })),
    rootDir: process.cwd(),
    scoring: iter.scores,
    shaderCode: iter.shader_code,
    kind: iter.kind ?? "fragment",
  });

  const next = await updateState(videoId, (s) => {
    s.best_iteration_id = pickBestIterationId(s);
    return s;
  });
  emitVideoUpdate(next);

  const finalIter = next.iterations.find((i) => i.id === iterationId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "diagnosis failed", iteration: finalIter },
      { status: 502 },
    );
  }
  return NextResponse.json({ iteration: finalIter });
}
