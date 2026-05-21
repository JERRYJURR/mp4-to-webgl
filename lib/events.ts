import { EventEmitter } from "node:events";
import type { IterationRecord, VideoState } from "./types";

type Events = {
  "video:update": (state: VideoState) => void;
  "iteration:update": (
    videoId: string,
    iteration: IterationRecord,
  ) => void;
};

// Singleton hot-reload-safe bus
const globalAny = global as unknown as {
  __mp4_event_bus?: EventEmitter;
};

export const bus: EventEmitter =
  globalAny.__mp4_event_bus ??
  (() => {
    const e = new EventEmitter();
    e.setMaxListeners(1000);
    globalAny.__mp4_event_bus = e;
    return e;
  })();

export function emitVideoUpdate(state: VideoState) {
  bus.emit("video:update", state);
}

export function emitIterationUpdate(
  videoId: string,
  iteration: IterationRecord,
) {
  bus.emit("iteration:update", videoId, iteration);
}

export type { Events };
