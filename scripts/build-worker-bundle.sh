#!/usr/bin/env bash
# Build WeClaw-Hub worker bundle for deploy-service
# Output: dist/weclaw-hub.js (single ES module, ready for Cloudflare Workers)

set -euo pipefail

echo "🔨 Building WeClaw-Hub worker bundle..."

# Ensure dist directory exists
mkdir -p dist

# Bundle the worker entry point
# --target bun: Use bun runtime for bundling
# --bundle: Bundle all dependencies
# --format esm: ES module output
# --outfile: Output to dist/weclaw-hub.js
bun build src/index.ts \
  --bundle \
  --target bun \
  --format esm \
  --outfile dist/weclaw-hub.js \
  --minify

echo "✅ Worker bundle written to dist/weclaw-hub.js"
echo "   Size: $(du -h dist/weclaw-hub.js | cut -f1)"

# Optionally show the bundle size
wc -c dist/weclaw-hub.js | awk '{printf "   Bytes: %s\n", $1}'