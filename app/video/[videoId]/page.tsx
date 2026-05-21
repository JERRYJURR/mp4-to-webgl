import { notFound } from "next/navigation";
import { readState } from "@/lib/persist";
import { OverlayClient } from "@/components/overlay/OverlayClient";

export const dynamic = "force-dynamic";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const state = await readState(videoId);
  if (!state) return notFound();
  return <OverlayClient initialState={state} />;
}
