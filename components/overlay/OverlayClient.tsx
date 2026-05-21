"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShaderCanvas } from "@/components/ShaderCanvas";
import { ThreeCanvas } from "@/components/ThreeCanvas";
import {
  ChevronDownIcon,
  CloseIcon,
  EllipsisIcon,
  FileVideoIcon,
  SendIcon,
  TrashIcon,
} from "@/components/icons";
import { IterationListItem } from "./IterationListItem";
import { CodePanel } from "./CodePanel";
import { PivotHintModal, PivotTechniqueModal } from "./PivotModals";
import { assetUrl } from "@/lib/assetUrl";
import type { IterationRecord, ShaderTechnique, VideoState } from "@/lib/types";

interface Props {
  initialState: VideoState;
}

type Selection = { kind: "source" } | { kind: "iteration"; id: string };

export function OverlayClient({ initialState }: Props) {
  const router = useRouter();
  const [state, setState] = useState<VideoState>(initialState);
  const [selection, setSelection] = useState<Selection>(() =>
    pickDefaultSelection(initialState),
  );
  const viewedStorageKey = `mp4-webgl:viewed:${initialState.video_id}`;
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(viewedStorageKey);
        if (raw) return new Set(JSON.parse(raw) as string[]);
      } catch {
        /* corrupted or unavailable → fall through */
      }
    }
    return new Set(selection.kind === "iteration" ? [selection.id] : []);
  });

  // Persist viewedIds so iterations the user has already opened don't reappear
  // as "new" on subsequent visits.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        viewedStorageKey,
        JSON.stringify(Array.from(viewedIds)),
      );
    } catch {
      /* quota / private-mode → ignore */
    }
  }, [viewedIds, viewedStorageKey]);
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pivotMenuOpen, setPivotMenuOpen] = useState(false);
  const [pivotModal, setPivotModal] = useState<"technique" | "hint" | null>(
    null,
  );
  const pivotMenuRef = useRef<HTMLDivElement | null>(null);
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);
  const videoMenuRef = useRef<HTMLDivElement | null>(null);
  const [iterationMenuOpen, setIterationMenuOpen] = useState(false);
  const iterationMenuRef = useRef<HTMLDivElement | null>(null);

  // Ordered list of selectable rows in sidebar: SOURCE row first, then iterations.
  const selectableItems = useMemo<Selection[]>(
    () => [
      { kind: "source" } as Selection,
      ...state.iterations.map((i): Selection => ({ kind: "iteration", id: i.id })),
    ],
    [state.iterations],
  );

  const moveSelection = useCallback(
    (delta: number) => {
      setSelection((current) => {
        const items = selectableItems;
        if (items.length === 0) return current;
        const idx = items.findIndex((it) =>
          it.kind === current.kind &&
          (it.kind === "source" || it.id === (current as { id: string }).id),
        );
        const safe = idx < 0 ? 0 : idx;
        const next = Math.max(0, Math.min(items.length - 1, safe + delta));
        return items[next];
      });
    },
    [selectableItems],
  );

  // Global keyboard: ESC closes (CodePanel first, then overlay).
  // ArrowUp/ArrowDown navigates the sidebar selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || tgt?.isContentEditable;
      if (inField) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (pivotModal) {
          setPivotModal(null);
        } else if (pivotMenuOpen) {
          setPivotMenuOpen(false);
        } else if (videoMenuOpen) {
          setVideoMenuOpen(false);
        } else if (iterationMenuOpen) {
          setIterationMenuOpen(false);
        } else if (showCode) {
          setShowCode(false);
        } else {
          router.push("/");
        }
        return;
      }
      if (showCode || pivotModal) return; // don't navigate while modal is open
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        moveSelection(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        moveSelection(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    showCode,
    pivotMenuOpen,
    pivotModal,
    videoMenuOpen,
    iterationMenuOpen,
    router,
    moveSelection,
  ]);

  // Close any open dropdown on outside click.
  useEffect(() => {
    const open = pivotMenuOpen || videoMenuOpen || iterationMenuOpen;
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (pivotMenuOpen && !pivotMenuRef.current?.contains(target)) {
        setPivotMenuOpen(false);
      }
      if (videoMenuOpen && !videoMenuRef.current?.contains(target)) {
        setVideoMenuOpen(false);
      }
      if (iterationMenuOpen && !iterationMenuRef.current?.contains(target)) {
        setIterationMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [pivotMenuOpen, videoMenuOpen, iterationMenuOpen]);

  useEffect(() => {
    const es = new EventSource(`/api/videos/${initialState.video_id}/stream`);
    es.addEventListener("snapshot", (ev) => {
      setState(JSON.parse((ev as MessageEvent).data) as VideoState);
    });
    es.addEventListener("video", (ev) => {
      setState(JSON.parse((ev as MessageEvent).data) as VideoState);
    });
    es.addEventListener("iteration", (ev) => {
      const iter = JSON.parse((ev as MessageEvent).data) as IterationRecord;
      setState((prev) => {
        const next = { ...prev };
        const i = next.iterations.findIndex((x) => x.id === iter.id);
        if (i >= 0)
          next.iterations = next.iterations.map((x, idx) =>
            idx === i ? iter : x,
          );
        else next.iterations = [...next.iterations, iter];
        return next;
      });
    });
    return () => es.close();
  }, [initialState.video_id]);

  const selectedIteration = useMemo(() => {
    if (selection.kind !== "iteration") return null;
    return state.iterations.find((i) => i.id === selection.id) ?? null;
  }, [state, selection]);

  // Mark selected iterations as viewed
  useEffect(() => {
    if (selection.kind === "iteration" && selectedIteration?.id) {
      const id = selectedIteration.id;
      setViewedIds((s) => {
        if (s.has(id)) return s;
        const next = new Set(s);
        next.add(id);
        return next;
      });
    }
  }, [selection, selectedIteration?.id]);

  async function postIteration(extra: {
    force_pivot?: boolean;
    pivot_technique?: ShaderTechnique;
    pivot_hint?: string;
  }) {
    if (busy) return;
    setBusy(true);
    try {
      const parent =
        selection.kind === "iteration" ? selection.id : null;
      const res = await fetch(`/api/videos/${state.video_id}/iterations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parent_iteration_id: parent, ...extra }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || `failed (${res.status})`);
      } else {
        const { iteration } = (await res.json()) as { iteration: IterationRecord };
        setSelection({ kind: "iteration", id: iteration.id });
      }
    } finally {
      setBusy(false);
    }
  }

  function startNewIteration() {
    return postIteration({});
  }

  function startPivotIteration(opts: {
    technique?: ShaderTechnique;
    hint?: string;
  } = {}) {
    return postIteration({
      force_pivot: true,
      pivot_technique: opts.technique,
      pivot_hint: opts.hint,
    });
  }

  // The pivot dropdown only makes sense when there's at least one prior
  // iteration with a shader to reject.
  const canPivot = state.iterations.some((i) => i.shader_code);

  async function deleteIteration(id: string) {
    const target = state.iterations.find((i) => i.id === id);
    if (!target) return;
    const niceName = `Iteration ${target.index}`;
    if (!confirm(`Delete ${niceName}? This removes its record and frames.`))
      return;
    const res = await fetch(
      `/api/videos/${state.video_id}/iterations/${id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || `delete failed (${res.status})`);
      return;
    }
    // If the deleted one was selected, fall back to the best remaining
    // iteration or to SOURCE.
    setSelection((s) => {
      if (s.kind === "iteration" && s.id === id) {
        const fallback = pickDefaultSelection({
          ...state,
          iterations: state.iterations.filter((i) => i.id !== id),
        });
        return fallback;
      }
      return s;
    });
  }

  async function deleteVideo() {
    if (
      !confirm(
        `Delete ${state.filename}? This removes the video, all iterations, and their frames.`,
      )
    )
      return;
    const res = await fetch(`/api/videos/${state.video_id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || `delete failed (${res.status})`);
      return;
    }
    router.push("/");
  }

  const someoneRunning = state.iterations.some((i) =>
    ["queued", "analyzing", "generating", "compiling", "capturing", "scoring"].includes(
      i.state,
    ),
  );
  const sourceSelected = selection.kind === "source";

  return (
    <div className="fixed inset-0 bg-[#09090B]/75 backdrop-blur-md flex items-stretch p-2">
      <div className="flex-1 flex items-stretch gap-2 rounded-3xl bg-[#09090B] outline outline-1 -outline-offset-1 outline-white/20 p-1.5">
        {/* SIDEBAR */}
        <aside
          className="flex flex-col gap-4 rounded-[20px] w-[256px] shrink-0 outline outline-1 -outline-offset-1 outline-white/10 p-1.5"
          style={{
            backgroundColor: "#09090B",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05), rgba(255,255,255,0.05))",
          }}
        >
          <div className="flex flex-col gap-1">
            <div
              className="overflow-hidden rounded-[18px] h-[135px] bg-cover bg-center outline outline-1 -outline-offset-1 outline-white/[0.05]"
              style={{
                backgroundImage: `url(${assetUrl(state.thumbnail_path)})`,
              }}
            />
            <div className="flex items-center px-3 py-2 justify-between gap-2">
              <div className="text-base/5 truncate flex items-center gap-2 min-w-0">
                <FileVideoIcon className="w-4 h-4 opacity-50 shrink-0" />
                <span className="truncate">{state.filename}</span>
              </div>
              <div ref={videoMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setVideoMenuOpen((o) => !o)}
                  aria-label="Video options"
                  aria-haspopup="menu"
                  aria-expanded={videoMenuOpen}
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/[0.10] transition"
                >
                  <EllipsisIcon className="w-4 h-4" />
                </button>
                {videoMenuOpen && (
                  <div
                    role="menu"
                    className="absolute top-full right-0 mt-2 w-[200px] rounded-2xl bg-[#1A1A1D] outline outline-1 -outline-offset-1 outline-white/10 p-1.5 shadow-xl z-10"
                  >
                    <MenuItem
                      tone="destructive"
                      icon={<TrashIcon className="w-4 h-4" />}
                      onClick={() => {
                        setVideoMenuOpen(false);
                        deleteVideo();
                      }}
                    >
                      Delete video
                    </MenuItem>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SOURCE */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl">
              <span className="uppercase tracking-widest opacity-50 text-[11px]/[14px] font-mono">
                Source
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelection({ kind: "source" })}
              className={[
                "w-full text-left flex items-center gap-2 px-3 py-2 rounded-2xl transition",
                sourceSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
              ].join(" ")}
            >
              <span
                className={[
                  "text-sm/[18px]",
                  sourceSelected ? "" : "opacity-70",
                ].join(" ")}
              >
                Original video
              </span>
            </button>
          </div>

          {/* ITERATIONS */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl">
              <span className="uppercase tracking-widest opacity-50 text-[11px]/[14px] font-mono">
                Iterations
              </span>
            </div>
            <div className="flex flex-col">
              {state.iterations.length === 0 && (
                <div className="px-3 py-2 text-sm opacity-50">
                  No iterations yet. Click <em>New iteration</em> to start.
                </div>
              )}
              {state.iterations.map((it) => (
                <IterationListItem
                  key={it.id}
                  iteration={it}
                  selected={
                    selection.kind === "iteration" && selection.id === it.id
                  }
                  isNew={!viewedIds.has(it.id) && it.state === "done"}
                  isBest={state.best_iteration_id === it.id}
                  onSelect={() =>
                    setSelection({ kind: "iteration", id: it.id })
                  }
                />
              ))}
            </div>
          </div>
        </aside>

        {/* HERO */}
        <main className="flex flex-col flex-1 relative">
          <div className="flex items-center gap-2 self-stretch justify-between p-2">
            <div ref={iterationMenuRef} className="relative">
              {selection.kind === "iteration" && selectedIteration ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIterationMenuOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={iterationMenuOpen}
                    className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-white/[0.05] transition"
                  >
                    <span className="text-base">
                      Iteration {selectedIteration.index}
                    </span>
                    {selectedIteration.diagnosis_status === "error" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-[#F87171]">
                        Diagnosis error
                      </span>
                    )}
                    <ChevronDownIcon className="w-4 h-4 opacity-60" />
                  </button>
                  {iterationMenuOpen && (
                    <div
                      role="menu"
                      className="absolute top-full left-0 mt-2 w-[220px] rounded-2xl bg-[#1A1A1D] outline outline-1 -outline-offset-1 outline-white/10 p-1.5 shadow-xl z-10"
                    >
                      <MenuItem
                        tone="destructive"
                        icon={<TrashIcon className="w-4 h-4" />}
                        onClick={() => {
                          setIterationMenuOpen(false);
                          deleteIteration(selectedIteration.id);
                        }}
                      >
                        Delete iteration
                      </MenuItem>
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <Link
              href="/"
              className="flex items-center rounded-full bg-white/[0.03] p-3 hover:bg-white/[0.08] transition"
              aria-label="close"
            >
              <CloseIcon className="w-6 h-6" />
            </Link>
          </div>

          <div className="flex-1 flex items-center justify-center px-12 py-8">
            <HeroPanel
              videoId={state.video_id}
              filename={state.filename}
              sourcePath={state.source_path}
              selection={selection}
              iteration={selectedIteration}
              duration={state.metadata.duration}
            />
          </div>

          {/* Bottom actions */}
          <div className="flex justify-end p-2">
            <div className="flex items-center gap-0 rounded-full bg-[#09090B] outline outline-1 -outline-offset-1 outline-white/20 p-1.5">
                <button
                  disabled={!selectedIteration}
                  onClick={() => setShowCode(true)}
                  className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/[0.05] outline outline-1 -outline-offset-1 outline-white/10 hover:bg-white/[0.10] disabled:opacity-40 transition"
                >
                  View code
                </button>
                <div
                  ref={pivotMenuRef}
                  className="relative flex items-stretch ml-2"
                >
                  <button
                    disabled={busy || someoneRunning}
                    onClick={startNewIteration}
                    className="flex items-center gap-2 pl-4 pr-3 py-3 rounded-l-full justify-center bg-[#4ADE80] text-[#09090B] disabled:opacity-50 hover:bg-[#86efac] transition"
                  >
                    <span>
                      {busy || someoneRunning ? "Running…" : "New iteration"}
                    </span>
                    <SendIcon className="w-5 h-5" />
                  </button>
                  <div className="w-px self-stretch bg-[#09090B]/20" />
                  <button
                    disabled={busy || someoneRunning || !canPivot}
                    onClick={() => setPivotMenuOpen((o) => !o)}
                    aria-label="More iteration options"
                    aria-haspopup="menu"
                    aria-expanded={pivotMenuOpen}
                    title={
                      canPivot
                        ? "Try a different approach"
                        : "Need a prior iteration before you can pivot"
                    }
                    className="flex items-center px-3 py-3 rounded-r-full bg-[#4ADE80] text-[#09090B] disabled:opacity-50 hover:bg-[#86efac] transition"
                  >
                    <EllipsisIcon className="w-5 h-5" />
                  </button>
                  {pivotMenuOpen && (
                    <div
                      role="menu"
                      className="absolute bottom-full right-0 mb-2 w-[320px] rounded-2xl bg-[#1A1A1D] outline outline-1 -outline-offset-1 outline-white/10 p-1.5 shadow-xl"
                    >
                      <MenuItem
                        onClick={() => {
                          setPivotMenuOpen(false);
                          startPivotIteration();
                        }}
                      >
                        Let Claude pick a different approach automatically
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setPivotMenuOpen(false);
                          setPivotModal("technique");
                        }}
                      >
                        Pick a different approach from a list
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setPivotMenuOpen(false);
                          setPivotModal("hint");
                        }}
                      >
                        Tell Claude what to try instead
                      </MenuItem>
                    </div>
                  )}
                </div>
              </div>
            </div>
        </main>
      </div>

      {showCode && selectedIteration && (
        <CodePanel
          videoId={state.video_id}
          iteration={selectedIteration}
          onClose={() => setShowCode(false)}
        />
      )}
      {pivotModal === "technique" && (
        <PivotTechniqueModal
          onClose={() => setPivotModal(null)}
          onSubmit={(technique) => {
            setPivotModal(null);
            startPivotIteration({ technique });
          }}
        />
      )}
      {pivotModal === "hint" && (
        <PivotHintModal
          onClose={() => setPivotModal(null)}
          onSubmit={(hint) => {
            setPivotModal(null);
            startPivotIteration({ hint });
          }}
        />
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  tone = "default",
  children,
}: {
  onClick(): void;
  icon?: React.ReactNode;
  tone?: "default" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        "w-full text-left text-sm px-3 py-2 rounded-xl flex items-center gap-2 transition",
        tone === "destructive"
          ? "text-[#F87171] hover:bg-[#F87171]/10"
          : "hover:bg-white/[0.08]",
      ].join(" ")}
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  );
}

function pickDefaultSelection(state: VideoState): Selection {
  if (state.best_iteration_id)
    return { kind: "iteration", id: state.best_iteration_id };
  const done = state.iterations.filter((i) => i.state === "done");
  if (done.length)
    return { kind: "iteration", id: done[done.length - 1].id };
  if (state.iterations.length)
    return {
      kind: "iteration",
      id: state.iterations[state.iterations.length - 1].id,
    };
  return { kind: "source" };
}

function HeroPanel({
  selection,
  iteration,
  duration,
  sourcePath,
  filename,
}: {
  videoId: string;
  filename: string;
  sourcePath: string;
  selection: Selection;
  iteration: IterationRecord | null;
  duration: number;
}) {
  if (selection.kind === "source") {
    return (
      <div className="w-full max-w-[1024px] aspect-video rounded-3xl overflow-hidden outline outline-1 -outline-offset-1 outline-white/10 bg-black flex items-center justify-center">
        <video
          key={sourcePath}
          src={assetUrl(sourcePath)}
          autoPlay
          loop
          muted
          playsInline
          controls
          className="w-full h-full object-contain"
          aria-label={`Original video: ${filename}`}
        />
      </div>
    );
  }

  if (!iteration) {
    return (
      <div className="text-center opacity-60 max-w-md">
        <p className="text-xl mb-2">No iterations yet.</p>
        <p className="text-base">
          Click <span className="text-[#4ADE80]">New iteration</span> to ask
          Claude to write the first shader.
        </p>
      </div>
    );
  }
  if (iteration.state === "failed") {
    return (
      <div className="text-center opacity-80 max-w-md">
        <p className="text-xl mb-2">Iteration {iteration.index} failed.</p>
        <p className="text-base opacity-70">
          {iteration.failure_reason === "compile_failed"
            ? "Shader didn't compile after 3 repair attempts."
            : iteration.failure_reason === "blank_output"
              ? "Render produced a blank canvas."
              : iteration.failure_reason === "timeout"
                ? "Render timed out."
                : "Runtime error during render."}
        </p>
      </div>
    );
  }
  if (iteration.state === "cancelled") {
    return (
      <div className="text-center opacity-60">
        Iteration {iteration.index} cancelled.
      </div>
    );
  }
  if (!iteration.shader_code) {
    return (
      <div className="text-center opacity-60">
        Iteration {iteration.index} — {iteration.state}…
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1024px] aspect-video rounded-3xl overflow-hidden outline outline-1 -outline-offset-1 outline-white/10 bg-black">
      {iteration.kind === "three_scene" ? (
        <ThreeCanvas
          sceneBody={iteration.shader_code}
          duration={duration}
          className="w-full h-full"
        />
      ) : (
        <ShaderCanvas
          shaderBody={iteration.shader_code}
          duration={duration}
          className="w-full h-full"
        />
      )}
    </div>
  );
}
