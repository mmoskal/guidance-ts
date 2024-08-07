#!/bin/sh

set -e
ESBUILD=./node_modules/.bin/esbuild
$ESBUILD src/cli.ts \
    --bundle \
    --platform=node --format=esm \
    --sourcemap \
    --outfile=dist/cli.js
node dist/cli.js
