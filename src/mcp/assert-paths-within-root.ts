import { isAbsolute, relative, resolve } from "node:path";

import { ValidationError } from "../shared/errors.js";

/**
 * `MCP_ALLOWED_ROOT` containment (R3, opt-in). When `allowedRoot` is `null` the
 * gateway keeps its CLI-equivalent filesystem reach — no containment. When set,
 * every agent-supplied path (each `transcribe` input plus `outputDir`) must
 * resolve to a location AT or UNDER the root; `..` escapes and absolute paths
 * outside the root are rejected as `ValidationError` (surfaced as `isError` by
 * the handler), never silently clamped.
 *
 * Relative candidates are resolved against the server process `cwd`, matching
 * how the core resolves them, so the check and the actual I/O agree.
 */
export function assertPathsWithinRoot(paths: readonly string[], allowedRoot: string | null): void {
  if (allowedRoot === null) {
    return;
  }

  for (const candidate of paths) {
    if (!isWithinRoot(candidate, allowedRoot)) {
      throw new ValidationError(
        `Caminho '${candidate}' esta fora de MCP_ALLOWED_ROOT (${allowedRoot}).`,
        "mcp",
      );
    }
  }
}

function isWithinRoot(candidate: string, allowedRoot: string): boolean {
  const rel = relative(allowedRoot, resolve(candidate));

  // "" -> the path IS the root; a leading ".." or an absolute result -> outside.
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
