// Environment type definitions for Cloudflare Workers
// Reference: .kiro/specs/hono-refactor-phase1/design.md

export interface Env {
  // Bindings
  BOT_SESSION: DurableObjectNamespace;
  BACKENDS: KVNamespace;
  CONTACTS: KVNamespace;

  // Configuration
  AUTH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  SYSTEM_PROMPT?: string;
  WECLAW_HUB_VERSION?: string;

  // Legacy fallback (Phase 1 保留，Phase 2 移除)
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  LLM_API_KEY?: string;

  // Test-only switches. Do not set in production.
  TEST_ONLY_ENABLE_SEED_CHAT?: string;
}
