import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  // wavy-shapes has 5 iterations and a best_iteration_id set
  await page.goto("http://localhost:3000/video/vid_8e8c2bbad7a33ae1", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);

  const sidebar = page.locator("aside").first();
  const box = await sidebar.boundingBox();
  if (!box) throw new Error("no sidebar");
  await page.screenshot({
    path: "/tmp/iters/sidebar_with_star.png",
    clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 },
  });
  console.log("/tmp/iters/sidebar_with_star.png");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
