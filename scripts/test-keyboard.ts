import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // Homepage hover screenshot
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  await page.locator('a[href^="/video/"]').first().hover();
  await page.waitForTimeout(400);
  const box = await page.locator('a[href^="/video/"]').first().boundingBox();
  if (box) {
    await page.screenshot({
      path: "/tmp/iters/card_hover_bumped.png",
      clip: {
        x: Math.max(0, box.x - 40),
        y: Math.max(0, box.y - 40),
        width: box.width + 80,
        height: box.height + 80,
      },
    });
  }
  console.log("hover ok");

  // Open overlay
  await page.goto("http://localhost:3000/video/vid_f14dac24ea8a5674", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // Arrow up should move from iteration to SOURCE (or up the list)
  const initial = await page.locator(".bg-white\\/\\[0\\.08\\]").first().textContent();
  console.log("initial selected:", JSON.stringify(initial));

  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300);
  const afterUp1 = await page.locator(".bg-white\\/\\[0\\.08\\]").first().textContent();
  console.log("after up x1:", JSON.stringify(afterUp1));

  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300);
  const afterUp2 = await page.locator(".bg-white\\/\\[0\\.08\\]").first().textContent();
  console.log("after up x2:", JSON.stringify(afterUp2));

  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  const afterDown = await page.locator(".bg-white\\/\\[0\\.08\\]").first().textContent();
  console.log("after down x1:", JSON.stringify(afterDown));

  await page.screenshot({ path: "/tmp/iters/overlay_keyboard_state.png" });

  // ESC should navigate to homepage
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  console.log("url after Escape:", page.url());

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
