// server-only enforced by Next.js route boundary
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type {
  CliCallOpts,
  CliCallResult,
  UserContentBlock,
} from "./claude-cli";

const BASE_URL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const DEFAULT_MAX_TOKENS = 8192;

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is required for the OpenRouter backend.",
    );
  }
  return key;
}

interface OAIContentText {
  type: "text";
  text: string;
}
interface OAIContentImage {
  type: "image_url";
  image_url: { url: string };
}
type OAIContent = OAIContentText | OAIContentImage;

function blockToOpenAI(c: UserContentBlock): OAIContent {
  if (c.type === "text") return { type: "text", text: c.text ?? "" };
  if (!c.source) throw new Error("image block missing source");
  const { media_type, data } = c.source;
  return {
    type: "image_url",
    image_url: { url: `data:${media_type};base64,${data}` },
  };
}

export async function callClaude(opts: CliCallOpts): Promise<CliCallResult> {
  const sessionId = randomUUID();
  const apiKey = getApiKey();
  const model = opts.model;
  if (!model) {
    throw new Error(
      "OpenRouter backend requires a model — set CLAUDE_ANALYSIS_MODEL / CLAUDE_GENERATION_MODEL / CLAUDE_DIAGNOSIS_MODEL (e.g. google/gemini-3.1-pro-preview, anthropic/claude-sonnet-4.6).",
    );
  }

  const messages: Array<{
    role: "system" | "user";
    content: string | OAIContent[];
  }> = [];
  if (opts.systemPrompt) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  messages.push({
    role: "user",
    content: opts.content.map(blockToOpenAI),
  });

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter uses these for traffic attribution; harmless if unset.
        ...(process.env.OPENROUTER_HTTP_REFERER
          ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
          : {}),
        ...(process.env.OPENROUTER_X_TITLE
          ? { "X-Title": process.env.OPENROUTER_X_TITLE }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: DEFAULT_MAX_TOKENS,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `OpenRouter ${res.status} ${res.statusText}: ${body.slice(0, 800)}`,
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (json.error?.message) {
      throw new Error(`OpenRouter error: ${json.error.message}`);
    }
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new Error(
        `OpenRouter returned empty content: ${JSON.stringify(json).slice(0, 800)}`,
      );
    }
    return { text, raw: json, sessionId };
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
