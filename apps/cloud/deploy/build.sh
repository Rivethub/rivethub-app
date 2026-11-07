#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
E=$(ls -d ../../node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | head -1)
rm -rf .deploy && mkdir -p .deploy/lib/bundle
"$E" src/server.ts src/cli/release-add.ts --bundle --platform=node --format=esm --target=node22 \
  --outdir=.deploy/lib/bundle --external:pg-native \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" --log-level=warning
cp -r migrations .deploy/
echo '{"type":"module"}' > .deploy/package.json
echo "built .deploy; ship with: rsync -a --delete .deploy/ <host>:/tmp/rivethub-cloud-deploy/ && ssh <host> sudo bash /tmp/install.sh"
