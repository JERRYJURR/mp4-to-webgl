import fs from "node:fs/promises";
import { readState } from "@/lib/persist";
import { RenderClient } from "./RenderClient";

interface Params {
  videoId: string;
  iterationId: string;
}

export default async function RenderPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{
    t?: string;
    duration?: string;
    width?: string;
    height?: string;
  }>;
}) {
  const { videoId, iterationId } = await params;
  const sp = await searchParams;

  const state = await readState(videoId);
  if (!state) {
    return <div style={{ color: "red" }}>missing video</div>;
  }
  const iter = state.iterations.find((i) => i.id === iterationId);
  if (!iter) {
    return <div style={{ color: "red" }}>missing iteration</div>;
  }

  const duration = Number(sp.duration ?? state.metadata.duration ?? 4);
  const t = Number(sp.t ?? 0);
  const width = Number(sp.width ?? 512);
  const height = Number(sp.height ?? 512);

  // Read the shader directly from state.json (already on disk)
  await fs.access(`videos/${videoId}/state.json`).catch(() => null);

  return (
    <RenderClient
      shaderBody={iter.shader_code}
      kind={iter.kind ?? "fragment"}
      duration={duration}
      t={t}
      width={width}
      height={height}
    />
  );
}
