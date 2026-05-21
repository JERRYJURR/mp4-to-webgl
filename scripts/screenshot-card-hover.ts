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
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(1200);

  // idle screenshot of card row
  const cards = page.locator('a[href^="/video/"]');
  const count = await cards.count();
  if (!count) throw new Error("no cards");
  const card = cards.nth(0);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/iters/cards_idle.png", clip: await cardBox(page, 0) });

  // hover
  await card.hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/iters/cards_hover.png", clip: await cardBox(page, 0) });

  console.log("ok");
  await browser.close();
}

async function cardBox(page: import("playwright").Page, n: number) {
  const box = await page.locator('a[href^="/video/"]').nth(n).boundingBox();
  if (!box) throw new Error("no box");
  const pad = 40;
  return {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
