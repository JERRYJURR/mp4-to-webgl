// server-only enforced by Next.js route boundary
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const NUL = String.fromCharCode(0);

export interface UserContentBlock {
  type: "text" | "image";
  text?: string;
  source?: { type: "base64"; media_type: string; data: string };
}

export interface CliCallOpts {
  content: UserContentBlock[];
  systemPrompt?: string;
  model?: string;
  tools?: string;
  timeoutMs?: number;
  maxBudgetUsd?: number;
}

export interface CliCallResult {
  text: string;
  raw: unknown;
  sessionId: string;
}

function projectsDirFor(cwd: string): string {
  const real = fsSync.realpathSync.native(cwd);
  const encoded = real.replace(/\//g, "-");
  return path.join(os.homedir(), ".claude", "projects", encoded);
}

function stripControlBytes(s: string): string {
  // The CLI's spawn() rejects argv strings containing null bytes; the Claude
  // SDK is fine, but the CLI path goes through Node spawn so we belt-and-brace
  // strip any null or backspace bytes that might appear in tool-generated JSON.
  return s.split(NUL).join("").replace(/[-]/g, "");
}

export async function callClaude(opts: CliCallOpts): Promise<CliCallResult> {
  const sessionId = randomUUID();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-shader-"));
  let projDir: string | null = null;
  try {
    projDir = projectsDirFor(tmpDir);
  } catch {
    /* best-effort */
  }

  const hasImages = opts.content.some((c) => c.type === "image");

  const args = [
    "-p",
    "--no-session-persistence",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--session-id",
    sessionId,
    "--tools",
    opts.tools ?? "",
    "--setting-sources",
    "user",
    "--exclude-dynamic-system-prompt-sections",
    "--permission-mode",
    "bypassPermissions",
  ];
  if (hasImages) {
    args.push(
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
    );
  } else {
    args.push("--output-format", "json");
  }
  if (opts.systemPrompt)
    args.push("--system-prompt", stripControlBytes(opts.systemPrompt));
  if (opts.model) args.push("--model", opts.model);
  if (opts.maxBudgetUsd != null)
    args.push("--max-budget-usd", String(opts.maxBudgetUsd));

  const child = spawn(CLAUDE_BIN, args, {
    cwd: tmpDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (hasImages) {
    const sanitised = opts.content.map((c) =>
      c.type === "text" ? { ...c, text: stripControlBytes(c.text ?? "") } : c,
    );
    const userMessage = {
      type: "user",
      message: { role: "user", content: sanitised },
    };
    child.stdin.write(JSON.stringify(userMessage) + "\n");
  } else {
    const joined = opts.content
      .map((c) => stripControlBytes(c.text ?? ""))
      .filter(Boolean)
      .join("\n\n");
    child.stdin.write(joined);
  }
  child.stdin.end();

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));

  const timeoutMs = opts.timeoutMs ?? 300_000;
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const t = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
        reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      child.on("error", (err) => {
        clearTimeout(t);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(t);
        resolve(code ?? 0);
      });
    });

    if (exitCode !== 0) {
      throw new Error(
        `claude CLI exited ${exitCode}: ${stderr.slice(-800) || stdout.slice(-400)}`,
      );
    }

    const lines = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let resultObj: any = null;
    let assistantText: string | null = null;
    for (const line of lines) {
      try {
        const j = JSON.parse(line);
        if (j.type === "result") resultObj = j;
        else if (j.type === "assistant" && j.message?.content) {
          const txt = j.message.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n");
          if (txt) assistantText = txt;
        }
      } catch {
        /* not JSON */
      }
    }
    if (!resultObj && !assistantText) {
      throw new Error(
        `could not parse claude CLI output. stderr:${stderr.slice(-400)}\nstdout-tail:${stdout.slice(-400)}`,
      );
    }
    if (resultObj?.is_error) {
      throw new Error(
        `claude CLI returned error: ${resultObj.result ?? JSON.stringify(resultObj)}`,
      );
    }
    const text = String(resultObj?.result ?? assistantText ?? "");
    return { text, raw: resultObj ?? { assistantText }, sessionId };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (projDir)
      await fs.rm(projDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function imageBlockFromFile(
  filePath: string,
): Promise<UserContentBlock> {
  const buf = await fs.readFile(filePath);
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: buf.toString("base64"),
    },
  };
}

export function textBlock(text: string): UserContentBlock {
  return { type: "text", text };
}
