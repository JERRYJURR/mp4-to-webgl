import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-webgl", "--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // Underwater video: has both an iteration and (after this script) we'll test source selection too.
  const videoId = "vid_f14dac24ea8a5674";
  await page.goto(`http://localhost:3000/video/${videoId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // 1. Default (iteration view)
  await page.screenshot({ path: "/tmp/iters/overlay_default.png" });
  console.log("/tmp/iters/overlay_default.png");

  // 2. Click "Original video" to select SOURCE
  await page.getByText("Original video").click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/iters/overlay_source.png" });
  console.log("/tmp/iters/overlay_source.png");

  // 3. Hover an iteration to see delete X (need an iteration in the list)
  await page.getByText("Iteration 1").first().hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/iters/overlay_hover.png" });
  console.log("/tmp/iters/overlay_hover.png");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
