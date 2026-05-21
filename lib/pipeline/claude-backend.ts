// server-only enforced by Next.js route boundary
//
// Picks the Claude call backend. With ANTHROPIC_API_KEY set (and
// CLAUDE_BACKEND != "cli") we use the Anthropic SDK — required for
// container deployments where the Claude Code CLI keychain auth is not
// available. Otherwise we fall back to the CLI, which consumes a Claude
// Code subscription rather than per-token credits.
import * as cli from "./claude-cli";
import * as sdk from "./claude-sdk";

const useSdk =
  !!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_BACKEND !== "cli";

export const BACKEND: "sdk" | "cli" = useSdk ? "sdk" : "cli";
export const callClaude = useSdk ? sdk.callClaude : cli.callClaude;
export const imageBlockFromFile = useSdk
  ? sdk.imageBlockFromFile
  : cli.imageBlockFromFile;
export const textBlock = useSdk ? sdk.textBlock : cli.textBlock;
export type { UserContentBlock } from "./claude-cli";
