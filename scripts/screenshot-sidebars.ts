import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  const dirs = await fs.readdir("videos");
  for (const d of dirs) {
    if (!d.startsWith("vid_")) continue;
    const stateFile = path.join("videos", d, "state.json");
    let s: any;
    try {
      s = JSON.parse(await fs.readFile(stateFile, "utf8"));
    } catch {
      continue;
    }
    if (!s.iterations?.length) continue;
    await page.goto(`http://localhost:3000/video/${d}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1200);
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('aside *')).map((el) => {
        const txt = (el as HTMLElement).innerText?.trim();
        return txt;
      }).filter((t) => t && /^Iteration \d+/.test(t)),
    );
    const unique = Array.from(new Set(labels));
    console.log(`${s.filename}: ${unique.join(" | ")}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
