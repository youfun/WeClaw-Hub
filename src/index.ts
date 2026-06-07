// WeClaw Hub — Cloudflare Workers entry point
// Reference: ref/knockknock/index.mjs (routing pattern)
// Reference: ref/weclaw/api/server.go (Send API)

export { BotSession } from "./BotSession.ts";

import type { Env } from "./env.ts";
import { app } from "./app.ts";
import { json } from "./utils.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await app.fetch(request, env);
    } catch (err) {
      if (err instanceof Error && err.message === "invalid_json") {
        return json({ error: "invalid_json" }, 400);
      }

      console.error("[worker] unhandled error", err);
      return json({ error: "internal_error" }, 500);
    }
  },
};