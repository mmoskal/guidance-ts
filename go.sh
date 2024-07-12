#!/bin/sh

set -e
ESBUILD=./node_modules/.bin/esbuild
$ESBUILD src/cli.ts --bundle --platform=node --format=cjs --outfile=dist/cli.js
node dist/cli.js
