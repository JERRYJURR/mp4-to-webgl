"use client";

import { SpinnerIcon, StarIcon } from "../icons";
import type { IterationRecord } from "@/lib/types";

interface Props {
  iteration: IterationRecord;
  selected: boolean;
  isNew: boolean;
  isBest: boolean;
  onSelect(): void;
}

const stateLabels: Record<string, string> = {
  queued: "Queued…",
  analyzing: "Analyzing…",
  generating: "Generating…",
  compiling: "Compiling…",
  capturing: "Capturing…",
  scoring: "Scoring…",
};

const failureLabels: Record<string, string> = {
  compile_failed: "Compile failed",
  runtime_failed: "Render failed",
  blank_output: "Blank output",
  timeout: "Timed out",
};

export function IterationListItem({
  iteration,
  selected,
  isNew,
  isBest,
  onSelect,
}: Props) {
  const inProgress = stateLabels[iteration.state] != null;
  const failed = iteration.state === "failed";
  const cancelled = iteration.state === "cancelled";
  const done = iteration.state === "done";

  const label = `Iteration ${iteration.index}`;
  const diagnosisError = done && iteration.diagnosis_status === "error";
  const status = failed
    ? failureLabels[iteration.failure_reason ?? ""] ?? "Failed"
    : cancelled
      ? "Cancelled"
      : inProgress
        ? stateLabels[iteration.state]
        : diagnosisError
          ? "Diagnosis error"
          : null;

  return (
    <div
      onClick={onSelect}
      className={[
        "group w-full text-left flex items-center gap-2 px-3 py-2 rounded-2xl cursor-pointer transition",
        selected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
        "justify-between",
      ].join(" ")}
    >
      <span
        className={[
          "text-sm/[18px] flex-1 truncate flex items-center gap-1.5",
          done && !selected ? "opacity-50" : "",
          isNew && !selected ? "font-bold" : "",
          (failed || cancelled) ? "opacity-50" : "",
          inProgress ? "opacity-50" : "",
        ].join(" ")}
      >
        <span className="truncate">{label}</span>
        {isBest && (
          <StarIcon
            aria-label="Best iteration"
            className="w-3 h-3 text-[#FAFAFA] opacity-60 shrink-0"
          />
        )}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {status ? (
          <span className="flex items-center gap-2 text-sm/[18px] opacity-50">
            {inProgress && <SpinnerIcon className="w-4 h-4 spin-slow" />}
            <span>{status}</span>
          </span>
        ) : isNew && !selected ? (
          <span className="flex items-center justify-center w-4 h-4">
            <span className="rounded-full bg-[#FAFAFA] opacity-60 w-1.5 h-1.5" />
          </span>
        ) : null}
      </span>
    </div>
  );
}
