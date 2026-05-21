"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SpinnerIcon } from "./icons";

export function UploadButton() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/videos", { method: "POST", body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `upload failed (${res.status})`);
      }
      const { video_id } = (await res.json()) as { video_id: string };
      startTransition(() => {
        router.push(`/video/${video_id}`);
      });
    } catch (e: any) {
      setErr(e?.message ?? "upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy || pending}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/[0.05] outline outline-1 -outline-offset-1 outline-white/10 hover:bg-white/[0.10] transition disabled:opacity-50"
      >
        {busy || pending ? (
          <SpinnerIcon className="w-5 h-5 spin-slow" />
        ) : (
          <PlusIcon className="w-5 h-5" />
        )}
        <span className="text-base/5">
          {busy || pending ? "Uploading…" : "Upload a video (.mp4)"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      {err && (
        <p className="text-sm text-red-400 mt-2 max-w-md text-center">{err}</p>
      )}
    </>
  );
}
