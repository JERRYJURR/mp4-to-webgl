import { callClaude, textBlock } from "../lib/pipeline/claude-cli";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function listShaderProjectsBefore() {
  const dir = path.join(os.homedir(), ".claude", "projects");
  const entries = await fs.readdir(dir).catch(() => []);
  return new Set(entries);
}

async function main() {
  const beforeProjects = await listShaderProjectsBefore();
  const t0 = Date.now();
  const res = await callClaude({
    content: [
      textBlock(
        "Reply with the single GLSL line: vec3 col = vec3(0.4, 0.2, 0.9); — nothing else.",
      ),
    ],
    systemPrompt:
      "You are a terse shader engineer. Respond with only the requested code line.",
    timeoutMs: 90_000,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`ok in ${dt}s. sessionId=${res.sessionId}`);
  console.log(`text: ${JSON.stringify(res.text)}`);

  // Verify no project dir leaked
  const dir = path.join(os.homedir(), ".claude", "projects");
  const afterProjects = await fs.readdir(dir).catch(() => []);
  const leaked = afterProjects.filter(
    (e) => !beforeProjects.has(e) && e.includes("claude-shader"),
  );
  console.log(`leaked entries: ${leaked.length === 0 ? "none ✓" : leaked.join(", ")}`);

  // Verify /tmp temp dir gone
  const tmps = await fs.readdir(os.tmpdir()).catch(() => []);
  const tmpLeaks = tmps.filter((e) => e.startsWith("claude-shader-"));
  console.log(`tmp leaks: ${tmpLeaks.length === 0 ? "none ✓" : tmpLeaks.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
