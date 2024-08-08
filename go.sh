#!/bin/sh

set -e
ESBUILD=./node_modules/.bin/esbuild
$ESBUILD src/cli.ts \
    --bundle \
    --platform=node --format=cjs \
    --sourcemap \
    --outfile=dist/cli.cjs
node dist/cli.cjs
