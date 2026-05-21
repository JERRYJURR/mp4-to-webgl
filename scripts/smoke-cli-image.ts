import { callClaude, imageBlockFromFile, textBlock } from "../lib/pipeline/claude-cli";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const before = new Set(
    await fs.readdir(path.join(os.homedir(), ".claude", "projects")).catch(() => []),
  );
  const frame = "/tmp/peek_vid_8afe9ec7b88da4b5/t3.png";
  const t0 = Date.now();
  const res = await callClaude({
    content: [
      await imageBlockFromFile(frame),
      textBlock(
        "Reply with exactly one word naming the dominant color in this image. No punctuation, no other text.",
      ),
    ],
    timeoutMs: 90_000,
  });
  console.log(`ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`text: ${JSON.stringify(res.text)}`);

  const after = await fs.readdir(path.join(os.homedir(), ".claude", "projects")).catch(() => []);
  const leaked = after.filter((e) => !before.has(e) && e.includes("claude-shader"));
  console.log(`leaked: ${leaked.length === 0 ? "none ✓" : leaked.join(", ")}`);
  const tmpLeaks = (await fs.readdir(os.tmpdir())).filter((e) => e.startsWith("claude-shader-"));
  console.log(`tmp leaks: ${tmpLeaks.length === 0 ? "none ✓" : tmpLeaks.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
