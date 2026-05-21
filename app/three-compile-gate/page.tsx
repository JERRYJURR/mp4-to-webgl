"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Server-side compile/init gate for Three.js scene bodies. The orchestrator's
 * Playwright runner navigates here, waits for `window.__gateReady`, then calls
 * `window.runGate(body)` and reads `{ ok, log }` back. Mirrors the inline
 * about:blank gate used for GLSL fragment shaders in lib/pipeline/orchestrator.ts,
 * but needs the Next.js bundler so it can import THREE.
 */
declare global {
  interface Window {
    __gateReady?: boolean;
    runGate?: (body: string) => Promise<{ ok: boolean; log: string }>;
  }
}

export default function ThreeCompileGate() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    window.runGate = async (body: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return { ok: false, log: "canvas not mounted" };
      let renderer: THREE.WebGLRenderer | null = null;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: false,
          preserveDrawingBuffer: false,
        });
        renderer.setSize(64, 64, false);

        const fn = new Function("THREE", "ctx", body) as (
          T: typeof THREE,
          c: { width: number; height: number; duration: number },
        ) => {
          scene?: THREE.Scene;
          camera?: THREE.Camera;
          update?: (t: number, dt: number) => void;
          dispose?: () => void;
        };
        const result = fn(THREE, { width: 64, height: 64, duration: 1 });
        if (!result?.scene || !result?.camera) {
          return {
            ok: false,
            log: "buildScene must return { scene, camera } — got: " +
              (result ? Object.keys(result).join(", ") : "nothing"),
          };
        }
        result.update?.(0, 0);
        renderer.render(result.scene, result.camera);
        try {
          result.dispose?.();
        } catch {
          /* user dispose error during gate is non-fatal */
        }
        return { ok: true, log: "" };
      } catch (err) {
        const msg =
          err instanceof Error ? err.stack || err.message : String(err);
        return { ok: false, log: msg };
      } finally {
        renderer?.dispose();
      }
    };
    window.__gateReady = true;
    return () => {
      delete window.runGate;
      window.__gateReady = false;
    };
  }, []);

  return (
    <div style={{ background: "#000", margin: 0, padding: 0 }}>
      <canvas
        ref={canvasRef}
        id="c"
        width={64}
        height={64}
        style={{ display: "block" }}
      />
    </div>
  );
}
