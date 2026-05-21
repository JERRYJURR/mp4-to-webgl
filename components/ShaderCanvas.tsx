"use client";

import { useEffect, useRef, useState } from "react";
import { createShaderRuntime, type RuntimeHandle } from "@/lib/shader/runtime";

interface Props {
  shaderBody: string;
  duration: number;
  className?: string;
  resolution?: { width: number; height: number };
  preserveDrawingBuffer?: boolean;
}

export function ShaderCanvas({
  shaderBody,
  duration,
  className,
  resolution,
  preserveDrawingBuffer,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(null);

    let handle: RuntimeHandle | null = null;
    const ro = new ResizeObserver(() => sizeCanvas());

    function sizeCanvas() {
      if (!canvas) return;
      if (resolution) {
        canvas.width = resolution.width;
        canvas.height = resolution.height;
        return;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    }

    sizeCanvas();
    if (containerRef.current && !resolution) ro.observe(containerRef.current);

    handle = createShaderRuntime({
      canvas,
      shaderBody,
      duration,
      preserveDrawingBuffer,
      onCompileError: (log) => setError(log),
    });

    return () => {
      ro.disconnect();
      handle?.stop();
    };
  }, [shaderBody, duration, resolution?.width, resolution?.height, preserveDrawingBuffer]);

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center text-sm text-red-300 font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}
    </div>
  );
}
