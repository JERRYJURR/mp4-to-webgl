import { NextRequest, NextResponse } from "next/server";
import { startIteration, isRunning, requestCancel } from "@/lib/pipeline/orchestrator";
import { getBaseUrl } from "@/lib/baseUrl";
import type { ShaderTechnique } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const ALLOWED_TECHNIQUES: readonly ShaderTechnique[] = [
  "fbm",
  "domain_warp",
  "raymarch",
  "particles",
  "voronoi",
  "reaction_diffusion",
  "postprocess",
  "three_scene",
];

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const parent = (body.parent_iteration_id ?? null) as string | null;
  const preset = body.preset as string | undefined;
  const forcePivot = body.force_pivot === true;
  const rawTechnique = body.pivot_technique;
  const pivotTechnique =
    typeof rawTechnique === "string" &&
    ALLOWED_TECHNIQUES.includes(rawTechnique as ShaderTechnique)
      ? (rawTechnique as ShaderTechnique)
      : undefined;
  const rawHint = body.pivot_hint;
  const pivotHint =
    typeof rawHint === "string" && rawHint.trim().length > 0
      ? rawHint.trim().slice(0, 2000)
      : undefined;
  if (isRunning(videoId)) {
    return NextResponse.json(
      { error: "iteration already running" },
      { status: 409 },
    );
  }
  const baseUrl = await getBaseUrl();
  const iter = await startIteration({
    videoId,
    parentIterationId: parent,
    preset,
    baseUrl,
    forcePivot,
    pivotTechnique,
    pivotHint,
  });
  return NextResponse.json({ iteration: iter });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  requestCancel(videoId);
  return NextResponse.json({ cancelled: true });
}
