import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
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
  if (!fs.existsSync(abs)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  return new NextResponse(buf, {
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=3600",
    },
  });
}
