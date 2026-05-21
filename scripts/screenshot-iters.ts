/**
 * For every video that has an iteration, screenshot the overlay and a clean
 * /render shot at t = midpoint so we can verify shaders render correctly.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { VIDEOS_DIR } from "../lib/paths";

async function main() {
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-webgl", "--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.error("PAGE", m.text());
  });

  const dirs = await fs.readdir(VIDEOS_DIR);
  await fs.mkdir("/tmp/iters", { recursive: true });

  for (const dir of dirs) {
    const statePath = path.join(VIDEOS_DIR, dir, "state.json");
    let raw: string;
    try {
      raw = await fs.readFile(statePath, "utf8");
    } catch {
      continue;
    }
    const state = JSON.parse(raw) as {
      video_id: string;
      filename: string;
      metadata: { duration: number };
      iterations: Array<{ id: string; state: string }>;
    };
    const doneIter = state.iterations.find((i) => i.state === "done");
    if (!doneIter) continue;

    const halfT = state.metadata.duration / 2;
    const renderUrl = `${base}/render/${state.video_id}/${doneIter.id}?t=${halfT}&duration=${state.metadata.duration}&width=512&height=512`;
    console.log(`render snapshot for ${state.filename}`);
    await page.goto(renderUrl, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(() => (window as any).__captureReady === true, {
        timeout: 5000,
      });
    } catch {}
    const out = `/tmp/iters/${state.filename.replace(/\.mp4$/, "")}.png`;
    await page.locator("canvas").first().screenshot({ path: out });
    console.log(`  -> ${out}`);

    // also screenshot the overlay
    await page.goto(`${base}/video/${state.video_id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);
    const oOut = `/tmp/iters/overlay_${state.filename.replace(/\.mp4$/, "")}.png`;
    await page.screenshot({ path: oOut, fullPage: false });
    console.log(`  -> ${oOut}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
