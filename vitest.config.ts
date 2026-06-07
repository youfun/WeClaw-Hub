import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        // Provide a dummy AUTH_TOKEN so management routes are reachable in tests
        bindings: {
          AUTH_TOKEN: "test-token",
          TEST_ONLY_ENABLE_SEED_CHAT: "1",
        },
      },
    }),
  ],
  // Exclude local adapter tests — they need Bun runtime (bun:test, bun:sqlite),
  // not the Cloudflare workerd pool. Run them separately with `bun test:local`.
  test: {
    include: ["src/__tests__/**"],
    exclude: ["src/__tests__/local/**", "node_modules/**"],
    testTimeout: 30000,
  },
});
