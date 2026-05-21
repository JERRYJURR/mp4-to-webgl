"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "../icons";
import type { ShaderTechnique } from "@/lib/types";

const TECHNIQUES: {
  id: ShaderTechnique;
  label: string;
  description: string;
}[] = [
  {
    id: "fbm",
    label: "Fractal Brownian Motion",
    description: "Layered noise — cloud-like, organic, drifting fields.",
  },
  {
    id: "domain_warp",
    label: "Domain Warp",
    description: "Noise distorted by other noise — fluid, swirling motion.",
  },
  {
    id: "raymarch",
    label: "Ray March",
    description:
      "3D ray tracing through a signed-distance field — volumetric, depth-rich.",
  },
  {
    id: "particles",
    label: "Particles",
    description: "Many discrete moving points or small shapes.",
  },
  {
    id: "voronoi",
    label: "Voronoi",
    description: "Cellular patterns from scattered seed points.",
  },
  {
    id: "reaction_diffusion",
    label: "Reaction–Diffusion",
    description: "Self-organising patterns — spots, stripes, growth.",
  },
  {
    id: "postprocess",
    label: "Post-process",
    description: "Composited 2D effects: bloom, kaleidoscope, dithering.",
  },
  {
    id: "three_scene",
    label: "Three.js Scene",
    description:
      "Switch to a Three.js scene — real 3D meshes, lights, and shadows. Best for footage with discrete geometric subjects.",
  },
];

interface TechniqueProps {
  onClose(): void;
  onSubmit(technique: ShaderTechnique): void;
}

export function PivotTechniqueModal({ onClose, onSubmit }: TechniqueProps) {
  const [picked, setPicked] = useState<ShaderTechnique | null>(null);

  return (
    <ModalShell title="Pick a different approach" onClose={onClose}>
      <p className="text-sm opacity-70">
        Claude will start fresh using the technique you pick, treating the
        current approach as a counter-example.
      </p>
      <div className="flex flex-col gap-1">
        {TECHNIQUES.map((t) => {
          const isPicked = picked === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPicked(t.id)}
              className={[
                "text-left rounded-2xl px-4 py-3 outline outline-1 -outline-offset-1 transition",
                isPicked
                  ? "bg-[#4ADE80]/15 outline-[#4ADE80]/60"
                  : "outline-white/10 hover:bg-white/[0.04]",
              ].join(" ")}
            >
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-xs opacity-60 mt-0.5">{t.description}</div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.10] transition"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!picked}
          onClick={() => picked && onSubmit(picked)}
          className="px-4 py-2 rounded-full bg-[#4ADE80] text-[#09090B] disabled:opacity-40 hover:bg-[#86efac] transition"
        >
          Start with this approach
        </button>
      </div>
    </ModalShell>
  );
}

interface HintProps {
  onClose(): void;
  onSubmit(hint: string): void;
}

export function PivotHintModal({ onClose, onSubmit }: HintProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = text.trim();

  return (
    <ModalShell title="Tell Claude what to try instead" onClose={onClose}>
      <p className="text-sm opacity-70">
        Describe what's wrong with the current approach or what direction to
        head in. Claude will start fresh, picking a new technique guided by
        your hint.
      </p>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && trimmed) {
            e.preventDefault();
            onSubmit(trimmed);
          }
        }}
        rows={5}
        maxLength={2000}
        placeholder="e.g. the shape should look more like clean vector curves than fbm noise"
        className="w-full resize-none rounded-2xl bg-black/40 outline outline-1 -outline-offset-1 outline-white/10 focus:outline-white/30 p-3 text-sm leading-5 font-mono"
      />
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs opacity-50">
          ⌘/Ctrl + Enter to submit
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.10] transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={() => onSubmit(trimmed)}
            className="px-4 py-2 rounded-full bg-[#4ADE80] text-[#09090B] disabled:opacity-40 hover:bg-[#86efac] transition"
          >
            Start with this hint
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose(): void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[#09090B]/95 backdrop-blur-sm flex items-center justify-center p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#09090B] outline outline-1 -outline-offset-1 outline-white/20 rounded-3xl p-6 w-full max-w-xl max-h-[90vh] flex flex-col gap-4 overflow-auto">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-white/[0.04] hover:bg-white/[0.10] p-3 transition"
            aria-label="close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
