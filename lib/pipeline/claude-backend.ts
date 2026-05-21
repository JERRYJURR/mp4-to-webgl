// server-only enforced by Next.js route boundary
//
// Picks the Claude call backend:
//   - OpenRouter (multi-provider, per-key credit caps) when OPENROUTER_API_KEY
//     is set. The pipeline becomes provider-agnostic — model env vars carry
//     OpenRouter slugs like "google/gemini-3.1-pro-preview" or
//     "anthropic/claude-sonnet-4.6".
//   - Anthropic SDK (per-token) when ANTHROPIC_API_KEY is set.
//   - Claude Code CLI otherwise — local-dev default, consumes a Claude Code
//     subscription rather than per-token credits. Forceable via CLAUDE_BACKEND=cli.
import * as cli from "./claude-cli";
import * as sdk from "./claude-sdk";
import * as openrouter from "./claude-openrouter";

type Backend = "openrouter" | "sdk" | "cli";

function pickBackend(): Backend {
  if (process.env.CLAUDE_BACKEND === "cli") return "cli";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "sdk";
  return "cli";
}

const impl = (() => {
  switch (pickBackend()) {
    case "openrouter":
      return openrouter;
    case "sdk":
      return sdk;
    case "cli":
      return cli;
  }
})();

export const BACKEND: Backend = pickBackend();
export const callClaude = impl.callClaude;
export const imageBlockFromFile = impl.imageBlockFromFile;
export const textBlock = impl.textBlock;
export type { UserContentBlock } from "./claude-cli";
