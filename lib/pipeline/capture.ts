// server-only enforced by Next.js route boundary
import { chromium, type Browser, type BrowserContext } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import { videoFramesDir } from "../paths";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: [
        "--use-gl=swiftshader",
        "--enable-webgl",
        "--disable-web-security",
        "--no-sandbox",
      ],
    });
  }
  return browserPromise;
}

export async function shutdownBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close().catch(() => {});
    browserPromise = null;
  }
}

export interface CaptureResult {
  paths: string[];
  width: number;
  height: number;
  errors: string[];
}

export interface CaptureOpts {
  videoId: string;
  iterationId: string;
  iterationIndex: number;
  duration: number;
  timestamps: number[];
  baseUrl: string;
  width?: number;
  height?: number;
}

export async function capturePlayedFrames(
  opts: CaptureOpts,
): Promise<CaptureResult> {
  const {
    videoId,
    iterationId,
    iterationIndex,
    duration,
    timestamps,
    baseUrl,
    width = 512,
    height = 512,
  } = opts;
  const dir = videoFramesDir(videoId);
  await fs.mkdir(dir, { recursive: true });

  const browser = await getBrowser();
  const context: BrowserContext = await browser.newContext({
    viewport: { width: width + 32, height: height + 32 },
    deviceScaleFactor: 1,
    ...(process.env.APP_PASSWORD
      ? {
          httpCredentials: {
            username: process.env.APP_USERNAME ?? "demo",
            password: process.env.APP_PASSWORD,
          },
        }
      : {}),
  });
  const errors: string[] = [];
  const written: string[] = [];

  try {
    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i];
      const page = await context.newPage();
      page.on("pageerror", (err) =>
        errors.push(`pageerror@t=${t}: ${err.message}`),
      );
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console@t=${t}: ${msg.text()}`);
      });
      const url = `${baseUrl}/render/${videoId}/${iterationId}?t=${t}&duration=${duration}&width=${width}&height=${height}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(() => (window as any).__captureReady === true, {
          timeout: 8000,
        });
      } catch (e) {
        errors.push(`waitFor __captureReady timed out at t=${t}`);
      }
      const captureError = await page.evaluate(
        () => (window as any).__captureError ?? null,
      );
      if (captureError) errors.push(`runtime@t=${t}: ${captureError}`);

      const outPath = path.join(
        dir,
        `iter_${String(iterationIndex).padStart(3, "0")}_${String(i).padStart(3, "0")}.png`,
      );
      const locator = page.locator("canvas").first();
      try {
        await locator.screenshot({ path: outPath, omitBackground: false });
        written.push(outPath);
      } catch (e: any) {
        errors.push(`screenshot@t=${t}: ${e.message}`);
      }
      await page.close();
    }
  } finally {
    await context.close();
  }
  return { paths: written, width, height, errors };
}

export async function detectBlankness(pngPaths: string[]): Promise<boolean> {
  // Quick blank detection: read a few bytes; truly black images compress to ~kb scale.
  // For correctness we sample pixels: see score.ts perceptualVector — here we just gate on file size.
  let allBlank = true;
  for (const p of pngPaths) {
    const stat = await fs.stat(p).catch(() => null);
    if (!stat) continue;
    if (stat.size > 4_000) allBlank = false;
  }
  return allBlank;
}
