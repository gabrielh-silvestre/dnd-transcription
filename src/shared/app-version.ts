import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// `__APP_VERSION__` is replaced at build time by esbuild (`define`) when it
// produces the standalone bundle, which runs with no reachable package.json.
// Under the tsc build the identifier does not exist; the `typeof` guard avoids
// a ReferenceError and the version is read from the package.json that sits at
// the project root relative to the compiled module.
declare const __APP_VERSION__: string | undefined;

const FALLBACK_VERSION = "0.0.0";

export function resolveAppVersion(): string {
  if (typeof __APP_VERSION__ === "string" && __APP_VERSION__.length > 0) {
    return __APP_VERSION__;
  }

  return readVersionFromPackageJson() ?? process.env.npm_package_version ?? FALLBACK_VERSION;
}

function readVersionFromPackageJson(): string | undefined {
  try {
    // dist/src/shared/app-version.js -> ../../../package.json (project root)
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = resolve(moduleDir, "../../../package.json");
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };

    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}
