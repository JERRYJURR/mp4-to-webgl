import { NextRequest, NextResponse } from "next/server";
import { readState, renumberIterations, updateState } from "@/lib/persist";
import { newIterationId } from "@/lib/id";
import { emitIterationUpdate, emitVideoUpdate } from "@/lib/events";
import type { IterationRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const shaderCode = String(body.shader_code ?? "").trim();
  if (!shaderCode) {
    return NextResponse.json({ error: "shader_code required" }, { status: 400 });
  }
  const parent = (body.parent_iteration_id ?? null) as string | null;
  const author = String(body.author ?? "manual");

  const existing = await readState(videoId);
  if (!existing) return NextResponse.json({ error: "no such video" }, { status: 404 });

  const now = new Date().toISOString();
  const iter: IterationRecord = {
    id: newIterationId(),
    index: 0, // placeholder; renumber rewrites it below
    parent_id: parent,
    state: "done",
    failure_reason: null,
    shader_code: shaderCode,
    diagnosis: null,
    scores: null,
    prompts: { generation: `[manual:${author}]`, diagnosis: "" },
    models: {
      analysis_model: "manual",
      generation_model: "manual",
      diagnosis_model: "manual",
    },
    compile: { status: "success", log: "", repair_attempts: 0 },
    capture: {
      viewport: [512, 512],
      device_scale_factor: 1,
      webgl_version: 2,
      timestamps: [],
    },
    comparison_frames: [],
    created_at: now,
    completed_at: now,
  };

  const next = await updateState(videoId, (s) => {
    s.iterations.push(iter);
    renumberIterations(s);
    s.best_iteration_id = iter.id;
    return s;
  });

  const canonical = next.iterations.find((i) => i.id === iter.id) ?? iter;
  emitIterationUpdate(videoId, canonical);
  emitVideoUpdate(next);

  return NextResponse.json({ iteration: canonical });
}
