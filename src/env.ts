// Environment type definitions for Cloudflare Workers
// Reference: .kiro/specs/hono-refactor-phase1/design.md
// Phase 2: Uses adapter interfaces (IBotNamespace, IKvStore) instead of CF-specific types.
//          CF runtime objects structurally satisfy these interfaces.

import type { IBotNamespace, IKvStore } from "./adapter-interfaces";

export interface Env {
  // Bindings
  BOT_SESSION: IBotNamespace;
  BACKENDS: IKvStore;
  CONTACTS: IKvStore;

  // Configuration
  AUTH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  SYSTEM_PROMPT?: string;
  WECLAW_HUB_VERSION?: string;

  // Custom Anthropic-compatible API base URL (e.g. StepFun, OpenRouter, etc.)
  // Overrides the hardcoded https://api.anthropic.com/v1/messages
  ANTHROPIC_BASE_URL?: string;

  // Legacy fallback (Phase 1 保留，Phase 2 移除)
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  LLM_API_KEY?: string;

  // Test-only switches. Do not set in production.
  TEST_ONLY_ENABLE_SEED_CHAT?: string;
}
