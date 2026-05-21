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
      // Force-flush past intermediary proxy buffers. trycloudflare.com edges
      // sometimes hold streamed responses up to ~16 KB before forwarding, so
      // we pad with a large SSE comment (spec-compliant, ignored by clients)
      // to push past whatever buffer is in the way.
      controller.enqueue(encoder.encode(":" + " ".repeat(65536) + "\n\n"));
      send("snapshot", initial);
      // Burst a few early heartbeats so any first-byte buffer the edge holds
      // is flushed quickly; after this the normal 15s cadence takes over.
      let earlyBeats = 0;
      const earlyTimer = setInterval(() => {
        if (closed || earlyBeats >= 5) {
          clearInterval(earlyTimer);
          return;
        }
        earlyBeats++;
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
        } catch {
          closed = true;
        }
      }, 500);

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
        clearInterval(earlyTimer);
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
