/**
 * Quick visual sanity-check for the homepage + overlay.
 */
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1316 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/home.png", fullPage: true });

  // Visit first video — SSE keeps the network open, so use domcontentloaded.
  const vid = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/video/"]') as HTMLAnchorElement;
    return a ? a.getAttribute("href") : null;
  });
  if (vid) {
    await page.goto(`http://localhost:3000${vid}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "/tmp/overlay.png", fullPage: false });
  }
  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
