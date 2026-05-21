"use client";

import { useState } from "react";
import { CloseIcon, SpinnerIcon } from "../icons";
import type { IterationRecord } from "@/lib/types";

interface Props {
  videoId: string;
  iteration: IterationRecord;
  onClose(): void;
}

export function CodePanel({ videoId, iteration, onClose }: Props) {
  const [scoresOpen, setScoresOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const isThree = iteration.kind === "three_scene";
  const sourceLabel = isThree ? "Three.js scene body" : "shader source";
  const langTag = isThree ? "js" : "glsl";
  const canRegenerate =
    iteration.state === "done" &&
    !!iteration.scores &&
    iteration.comparison_frames.length > 0;
  const diagnosisError = iteration.diagnosis_status === "error";

  async function regenerateDiagnosis() {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch(
        `/api/videos/${videoId}/iterations/${iteration.id}/diagnose`,
        { method: "POST" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || `regenerate failed (${res.status})`);
      }
      // On success the SSE stream pushes the updated iteration; nothing else to do.
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#09090B]/95 backdrop-blur-sm flex items-center justify-center p-8">
      <div className="bg-[#09090B] outline outline-1 -outline-offset-1 outline-white/20 rounded-3xl p-6 w-full max-w-5xl max-h-[90vh] flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-3">
            <span>Iteration {iteration.index} — {sourceLabel}</span>
            <span className="text-xs font-mono uppercase tracking-widest opacity-50 px-2 py-0.5 rounded-full bg-white/[0.06]">
              {langTag}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="rounded-full bg-white/[0.04] hover:bg-white/[0.10] p-3 transition"
            aria-label="close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </header>

        {diagnosisError && (
          <div className="flex items-start gap-3 rounded-2xl p-4 bg-red-950/30 ring-1 ring-[#F87171]/30">
            <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 bg-[#F87171]" />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#F87171]">Diagnosis error</span>
                {canRegenerate && (
                  <RegenerateButton regenerating={regenerating} onClick={regenerateDiagnosis} />
                )}
              </div>
              {iteration.diagnosis_error && (
                <pre className="text-xs font-mono opacity-70 whitespace-pre-wrap">
                  {iteration.diagnosis_error}
                </pre>
              )}
            </div>
          </div>
        )}

        <pre className="flex-1 overflow-auto text-xs leading-5 font-mono bg-black/40 p-4 rounded-2xl whitespace-pre-wrap">
          {iteration.shader_code ||
            (isThree ? "(no scene body yet)" : "(no shader code yet)")}
        </pre>

        <details
          open={scoresOpen}
          onToggle={(e) => setScoresOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-sm opacity-70 hover:opacity-100">
            Scores
          </summary>
          <pre className="text-xs font-mono opacity-80 p-3 bg-white/[0.04] rounded-xl mt-2">
            {JSON.stringify(iteration.scores ?? {}, null, 2)}
          </pre>
        </details>

        <details
          open={diagOpen}
          onToggle={(e) => setDiagOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-sm opacity-70 hover:opacity-100 flex items-center justify-between">
            <span>Diagnosis</span>
            {canRegenerate && !diagnosisError && (
              <RegenerateButton regenerating={regenerating} onClick={regenerateDiagnosis} />
            )}
          </summary>
          <pre className="text-xs font-mono opacity-80 p-3 bg-white/[0.04] rounded-xl mt-2">
            {JSON.stringify(iteration.diagnosis ?? {}, null, 2)}
          </pre>
        </details>

        {iteration.compile?.log && iteration.state === "failed" && (
          <details>
            <summary className="cursor-pointer text-sm text-red-300 hover:text-red-200">
              Failure log
            </summary>
            <pre className="text-xs font-mono text-red-300 p-3 bg-red-950/40 rounded-xl mt-2 whitespace-pre-wrap">
              {iteration.compile.log}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function RegenerateButton({
  regenerating,
  onClick,
}: {
  regenerating: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      disabled={regenerating}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.10] disabled:opacity-50 transition text-xs"
    >
      {regenerating && <SpinnerIcon className="w-3 h-3 spin-slow" />}
      <span>{regenerating ? "Regenerating…" : "Regenerate diagnosis"}</span>
    </button>
  );
}
