import process from "node:process";
import { pathToFileURL } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { resolveInfra } from "./resolve-infra.js";
import { createTranscriptionMcpServer } from "./server.js";

/**
 * Starts the MCP stdio server. R3 fail-fast: {@link resolveInfra} validates the
 * env-derived provider config and THROWS on invalid env, so a misconfigured
 * server aborts with a non-zero exit code BEFORE `server.connect` is reached —
 * it never connects with broken infra. stdout carries only JSON-RPC; all logs
 * go to stderr (see {@link createStderrBufferLogger}).
 */
export async function startMcpServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  // Throws BEFORE connect on invalid env for the configured openai-* provider.
  const infra = resolveInfra(env);

  const server = createTranscriptionMcpServer({ infra, env });
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

export async function main(): Promise<void> {
  try {
    await startMcpServer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Diagnostics on stderr only — stdout is reserved for JSON-RPC framing.
    process.stderr.write(`FATAL [mcp] ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
