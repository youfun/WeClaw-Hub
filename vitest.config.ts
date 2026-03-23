import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        // Provide a dummy AUTH_TOKEN so management routes are reachable in tests
        bindings: { AUTH_TOKEN: "test-token" },
      },
    }),
  ],
});
