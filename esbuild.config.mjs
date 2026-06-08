// esbuild build configuration — standalone ESM bundles for the two gateways.
//
// Produces two SEPARATE self-contained ESM files, one per gateway entry:
//   - dist/bundle.js      (entry src/cli/main.ts): the CLI gateway + its deps
//     (commander, openai). Because src/cli/** never imports src/mcp/** (HARD
//     RULE), the MCP SDK/zod are UNREACHABLE from this entry and esbuild does
//     NOT pull them in — testable guard: `grep -c modelcontextprotocol dist/bundle.js` == 0.
//   - dist/mcp-server.js  (entry src/mcp/main.ts): the MCP stdio gateway, whose
//     graph includes @modelcontextprotocol/sdk + zod (and the shared core).
//
// Node built-ins stay external; ffmpeg/ffprobe are child_process.spawn PATH
// deps (not imports), untouched in both outputs.
//
// Invoked by the `build:bundle` npm script: `node esbuild.config.mjs`.
// esbuild transpiles TypeScript without type-checking, so the full quality
// gate is `npm run build && npm run build:bundle`.

import { readFileSync } from "node:fs";

import { build } from "esbuild";

// Freeze the package.json version into each bundle. The standalone artifacts run
// with no reachable package.json, so the version resolves __APP_VERSION__ from
// this define instead of a runtime file read (see src/shared/app-version.ts).
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const shared = {
  bundle: true, // inline all npm deps so the artifact runs with zero node_modules
  platform: "node", // Node built-ins (fs, path, child_process, node:url) stay external; enables CJS->ESM interop
  format: "esm", // mandatory: both entries rely on the import.meta.url entrypoint guard
  target: "node22", // align with engines.node >=22.12.0; do not down-level modern syntax
  logLevel: "warning", // surface dynamic-require / CJS->ESM interop warnings without failing the build
  banner: { js: "#!/usr/bin/env node" }, // make the bundles directly executable (chmod +x)
  define: { __APP_VERSION__: JSON.stringify(version) }, // build-time version for the standalone `--version`
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/cli/main.ts"],
    outfile: "dist/bundle.js", // coexists with tsc output under dist/src/**; never replaces it
  }),
  build({
    ...shared,
    entryPoints: ["src/mcp/main.ts"],
    outfile: "dist/mcp-server.js", // separate graph: SDK/zod live here, never in dist/bundle.js
  }),
]).catch(() => process.exit(1));
