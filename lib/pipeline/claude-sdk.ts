// server-only enforced by Next.js route boundary
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type {
  CliCallOpts,
  CliCallResult,
  UserContentBlock,
} from "./claude-cli";

const DEFAULT_MODEL = "claude-opus-4-7";
const DEFAULT_MAX_TOKENS = 8192;

let clientPromise: Anthropic | null = null;
function getClient(): Anthropic {
  if (!clientPromise) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is required for the SDK backend (set CLAUDE_BACKEND=cli to use the CLI instead).",
      );
    }
    clientPromise = new Anthropic({ apiKey });
  }
  return clientPromise;
}

export async function callClaude(opts: CliCallOpts): Promise<CliCallResult> {
  const sessionId = randomUUID();
  const client = getClient();
  const model = opts.model ?? DEFAULT_MODEL;

  const content = opts.content.map((c) => {
    if (c.type === "text") {
      return { type: "text" as const, text: c.text ?? "" };
    }
    if (!c.source) throw new Error("image block missing source");
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: c.source.media_type as
          | "image/png"
          | "image/jpeg"
          | "image/gif"
          | "image/webp",
        data: c.source.data,
      },
    };
  });

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const msg = await client.messages.create(
      {
        model,
        max_tokens: DEFAULT_MAX_TOKENS,
        ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
        messages: [{ role: "user", content }],
      },
      { signal: controller.signal },
    );

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return { text, raw: msg, sessionId };
  } finally {
    clearTimeout(timer);
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
