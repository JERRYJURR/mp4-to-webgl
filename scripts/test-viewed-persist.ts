import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const url = "http://localhost:3000/video/vid_f14dac24ea8a5674";

  // Clean storage first
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Inspect which iteration rows have the 'new' indicator (the small dot)
  const newRows = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll('[class*="rounded-2xl"]'),
    );
    return rows
      .filter((r) => r.querySelector('span[class*="rounded-full"]'))
      .map((r) => (r as HTMLElement).innerText.trim());
  });
  console.log("rows with dot BEFORE clicking anything:", newRows);

  // Click Iteration 1
  await page.getByText("Iteration 1").click();
  await page.waitForTimeout(500);

  // Reload
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const newRowsAfter = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll('[class*="rounded-2xl"]'),
    );
    return rows
      .filter((r) => r.querySelector('span[class*="rounded-full"]'))
      .map((r) => (r as HTMLElement).innerText.trim());
  });
  console.log("rows with dot AFTER click + reload:", newRowsAfter);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
