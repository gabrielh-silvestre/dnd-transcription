// esbuild build configuration — standalone ESM CLI bundle.
//
// Produces dist/bundle.js: a single self-contained ESM file bundling
// src/cli/main.ts plus all npm dependencies (commander, openai, and their
// transitive graph), with Node built-ins left external and ffmpeg/ffprobe
// untouched (those are child_process.spawn calls, not imports).
//
// Invoked by the `build:bundle` npm script: `node esbuild.config.mjs`.
// esbuild transpiles TypeScript without type-checking, so the full quality
// gate is `npm run build && npm run build:bundle`.

import { build } from "esbuild";

build({
  entryPoints: ["src/cli/main.ts"],
  bundle: true, // inline all npm deps so the artifact runs with zero node_modules
  platform: "node", // Node built-ins (fs, path, child_process, node:url) stay external; enables CJS->ESM interop
  format: "esm", // mandatory: src/cli/main.ts relies on the import.meta.url entrypoint guard
  target: "node22", // align with engines.node >=22.12.0; do not down-level modern syntax
  outfile: "dist/bundle.js", // coexists with tsc output under dist/src/**; never replaces it
  logLevel: "warning", // surface dynamic-require / CJS->ESM interop warnings without failing the build

  // Extension points (add only on demonstrated need):
  //   external: ["..."]      - force a dependency to stay un-bundled
  //   banner: { js: "..." }  - inject a require/__dirname shim if a bundled dep needs it
}).catch(() => process.exit(1));
