import { Header } from "@/components/Header";
import { UploadButton } from "@/components/UploadButton";
import { VideoCard } from "@/components/VideoCard";
import { listVideoStates } from "@/lib/persist";
import path from "node:path";
import type { VideoListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadVideos(): Promise<VideoListItem[]> {
  const states = await listVideoStates();
  return states
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .map((s) => ({
      video_id: s.video_id,
      filename: s.filename,
      thumbnail_path: s.thumbnail_path,
      source_path: s.source_path,
      iteration_count: s.iterations.filter((i) => i.state === "done").length,
      best_iteration_id: s.best_iteration_id,
      is_sample: !!(s as any).is_sample,
    }));
}

export default async function HomePage() {
  const videos = await loadVideos();

  return (
    <div className="min-h-screen w-full flex flex-col items-center bg-[#09090B]">
      <div className="w-full max-w-[1440px] flex flex-col items-stretch">
        <Header />

        <section className="flex flex-col items-center gap-8 py-12 px-16">
          <div className="flex flex-col items-center gap-8">
            <h1 className="text-[65px] leading-none tracking-[-0.025em] font-bold text-center whitespace-pre">
              {".mp4 to WebGL\nIterative shaders"}
            </h1>
            <p className="text-[20px] leading-[150%] opacity-50 text-center max-w-[720px]">
              Using iterative Claude loops to render cool web graphics for your
              frontend.<br />Just upload a .mp4 video.
            </p>
          </div>
          <div className="flex items-center rounded-full bg-white/[0.05] outline outline-1 -outline-offset-1 outline-white/10 p-2">
            <UploadButton />
          </div>
        </section>

        {videos.length === 0 && (
          <section className="px-16 pb-24 text-center text-base opacity-60">
            <p className="max-w-xl mx-auto">
              No videos yet. Strongest results come from abstract or textural
              footage — smoke, water, lightning, particles, fog, dye-in-water,
              fabric, atmospheric light.
            </p>
          </section>
        )}

        <section className="grid grid-cols-3 gap-8 px-16 py-8">
          {videos.map((v) => (
            <VideoCard key={v.video_id} video={v} />
          ))}
        </section>

        <footer className="px-16 py-12 opacity-50 text-sm leading-6 max-w-3xl">
          Strongest results come from abstract or textural footage — smoke,
          water, lightning, particles, fog, dye-in-water, fabric, atmospheric
          light. Real footage with faces, language, or fast cuts will mostly fail
          to converge — a limitation of fragment-shader synthesis from scratch,
          not the loop.
        </footer>
      </div>
    </div>
  );
}
