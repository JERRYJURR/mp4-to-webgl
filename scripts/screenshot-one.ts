import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const [, , videoId, iterId, tStr, outPath] = process.argv;
if (!videoId || !iterId) {
  console.error("usage: screenshot-one.ts <videoId> <iterId> [t] [out]");
  process.exit(1);
}

async function main() {
  const statePath = path.join("videos", videoId, "state.json");
  const state = JSON.parse(await fs.readFile(statePath, "utf8")) as {
    metadata: { duration: number };
  };
  const duration = state.metadata.duration;
  const t = Number(tStr ?? duration / 2);
  const out = outPath ?? `/tmp/iters/single_${videoId}_${iterId}.png`;
  await fs.mkdir(path.dirname(out), { recursive: true });

  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-webgl", "--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 600, height: 600 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const url = `http://localhost:3000/render/${videoId}/${iterId}?t=${t}&duration=${duration}&width=512&height=512`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => (window as any).__captureReady === true, {
      timeout: 6000,
    });
  } catch {}
  await page.locator("canvas").first().screenshot({ path: out });
  console.log(out);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
