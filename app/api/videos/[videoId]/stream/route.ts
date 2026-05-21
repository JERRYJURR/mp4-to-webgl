import { bus } from "@/lib/events";
import { readState } from "@/lib/persist";
import type { IterationRecord, VideoState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const initial = await readState(videoId);
  if (!initial) {
    return new Response("not found", { status: 404 });
  }

  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      // Force-flush past intermediary proxy buffers (Cloudflare's HTTP/2 path
      // holds responses until ~2 KB; SSE comments are spec-compliant and
      // ignored by the client). Without this, the trycloudflare.com tunnel
      // never delivers the first event until the heartbeat fires.
      controller.enqueue(encoder.encode(":" + " ".repeat(2048) + "\n\n"));
      send("snapshot", initial);

      const onVideo = (state: VideoState) => {
        if (state.video_id === videoId) send("video", state);
      };
      const onIteration = (vid: string, iter: IterationRecord) => {
        if (vid === videoId) send("iteration", iter);
      };
      bus.on("video:update", onVideo);
      bus.on("iteration:update", onIteration);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
        } catch {
          closed = true;
        }
      }, 15_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        bus.off("video:update", onVideo);
        bus.off("iteration:update", onIteration);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
