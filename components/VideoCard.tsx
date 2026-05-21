"use client";

import Link from "next/link";
import { useRef } from "react";
import type { VideoListItem } from "@/lib/types";
import { assetUrl } from "@/lib/assetUrl";
import { IterationsIcon } from "./icons";

export function VideoCard({ video }: { video: VideoListItem }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function startPlayback() {
    const v = videoRef.current;
    if (!v) return;
    // Ignore autoplay rejections (some browsers require interaction first).
    void v.play().catch(() => {});
  }
  function stopPlayback() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* some browsers throw if metadata isn't loaded yet */
    }
  }

  return (
    <Link
      href={`/video/${video.video_id}`}
      onMouseEnter={startPlayback}
      onMouseLeave={stopPlayback}
      onFocus={startPlayback}
      onBlur={stopPlayback}
      className="group relative isolate flex flex-col items-start flex-1 rounded-3xl gap-2 transition before:content-[''] before:absolute before:-inset-4 before:rounded-[2.5rem] before:bg-white/[0.08] before:opacity-0 hover:before:opacity-100 focus-visible:before:opacity-100 before:transition-opacity before:-z-10 before:pointer-events-none"
    >
      <div className="flex flex-col items-start gap-0 rounded-3xl self-stretch bg-white/[0.10] outline outline-1 -outline-offset-1 outline-white/20 p-1.5">
        <video
          ref={videoRef}
          src={assetUrl(video.source_path)}
          poster={assetUrl(video.thumbnail_path)}
          muted
          loop
          playsInline
          preload="metadata"
          className="rounded-[18px] h-[223px] w-full object-cover outline outline-1 -outline-offset-1 outline-white/[0.05] bg-black"
        />
      </div>
      <div className="flex items-start gap-0 self-stretch justify-between p-3">
        <div className="text-base/5 text-[#FAFAFA] truncate max-w-[80%]">
          {video.filename}
        </div>
        <div className="flex items-center gap-1 justify-end">
          <IterationsIcon className="w-4 h-4 text-[#FAFAFA] opacity-50" />
          <div className="opacity-50 text-base/5">{video.iteration_count}</div>
        </div>
      </div>
    </Link>
  );
}
