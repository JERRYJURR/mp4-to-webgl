import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { ROOT, VIDEOS_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.searchParams.get("path");
  if (!p) return NextResponse.json({ error: "missing path" }, { status: 400 });
  const abs = path.resolve(ROOT, p);
  if (!abs.startsWith(VIDEOS_DIR)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const ext = path.extname(abs).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";
  const size = stat.size;

  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end >= size ||
        start > end
      ) {
        return new NextResponse(null, {
          status: 416,
          headers: { "content-range": `bytes */${size}` },
        });
      }
      const nodeStream = fs.createReadStream(abs, { start, end });
      return new NextResponse(
        Readable.toWeb(nodeStream) as unknown as ReadableStream,
        {
          status: 206,
          headers: {
            "content-type": contentType,
            "content-length": String(end - start + 1),
            "content-range": `bytes ${start}-${end}/${size}`,
            "accept-ranges": "bytes",
            "cache-control": "public, max-age=3600",
          },
        },
      );
    }
  }

  const nodeStream = fs.createReadStream(abs);
  return new NextResponse(
    Readable.toWeb(nodeStream) as unknown as ReadableStream,
    {
      headers: {
        "content-type": contentType,
        "content-length": String(size),
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=3600",
      },
    },
  );
}
