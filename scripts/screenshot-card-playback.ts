import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);

  const cards = page.locator('a[href^="/video/"]');
  const card = cards.nth(1); // pick the 2nd card to skip wavy-shapes which is plain
  await card.scrollIntoViewIfNeeded();

  // idle: confirm video paused
  const idleState = await card.locator("video").evaluate((v) => ({
    paused: (v as HTMLVideoElement).paused,
    currentTime: (v as HTMLVideoElement).currentTime,
  }));
  console.log("idle:", idleState);

  // hover
  await card.hover();
  await page.waitForTimeout(1200);
  const hoverState = await card.locator("video").evaluate((v) => ({
    paused: (v as HTMLVideoElement).paused,
    currentTime: (v as HTMLVideoElement).currentTime,
  }));
  console.log("after hover ~1.2s:", hoverState);
  await page.screenshot({ path: "/tmp/iters/card_video_hover.png" });

  // leave (move mouse far away)
  await page.mouse.move(20, 20);
  await page.waitForTimeout(400);
  const leaveState = await card.locator("video").evaluate((v) => ({
    paused: (v as HTMLVideoElement).paused,
    currentTime: (v as HTMLVideoElement).currentTime,
  }));
  console.log("after leave:", leaveState);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
