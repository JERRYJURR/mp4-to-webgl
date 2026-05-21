"use client";

import { useEffect, useRef, useState } from "react";
import { createShaderRuntime } from "@/lib/shader/runtime";
import { createThreeRuntime } from "@/lib/three/runtime";
import type { IterationKind } from "@/lib/types";

interface Props {
  shaderBody: string;
  kind: IterationKind;
  duration: number;
  t: number;
  width: number;
  height: number;
}

declare global {
  interface Window {
    __captureReady?: boolean;
    __captureError?: string;
  }
}

export function RenderClient({
  shaderBody,
  kind,
  duration,
  t,
  width,
  height,
}: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    function onError(log: string) {
      setErr(log);
      window.__captureError = log;
      window.__captureReady = true;
    }
    const handle =
      kind === "three_scene"
        ? createThreeRuntime({
            canvas,
            sceneBody: shaderBody,
            duration,
            preserveDrawingBuffer: true,
            onError,
          })
        : createShaderRuntime({
            canvas,
            shaderBody,
            duration,
            preserveDrawingBuffer: true,
            onCompileError: onError,
          });
    if (!handle) return;
    handle.renderOnce(t);
    requestAnimationFrame(() => {
      window.__captureReady = true;
    });
    return () => handle.stop();
  }, [shaderBody, kind, duration, t, width, height]);

  return (
    <div
      style={{
        background: "#000",
        margin: 0,
        padding: 0,
        width,
        height,
      }}
    >
      <canvas ref={ref} style={{ display: "block", width, height }} />
      {err && (
        <pre
          id="capture-error"
          style={{
            color: "#fff",
            background: "#900",
            padding: 8,
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
          }}
        >
          {err}
        </pre>
      )}
    </div>
  );
}
