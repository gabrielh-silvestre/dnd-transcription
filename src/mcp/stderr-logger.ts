import process from "node:process";

import { type Logger } from "../shared/logger.js";

/**
 * A {@link Logger} that NEVER touches stdout. MCP stdio uses stdout for JSON-RPC
 * framing, so any log line on stdout would corrupt the protocol stream. This
 * logger writes operator-visible diagnostics to stderr AND records every line in
 * an in-memory buffer so the gateway can attach the captured log to the tool
 * result (the agent sees what happened without polluting the wire).
 *
 * `createChildLogger` (multi-input runs, `run-batch-transcription-use-case.ts`)
 * wraps and inherits this base, so child loggers are stdout-safe automatically.
 */
export interface BufferingLogger {
  logger: Logger;
  /** Returns a snapshot of every buffered line, oldest first. */
  drain(): string[];
}

function formatMetadata(metadata?: Record<string, unknown>): string {
  if (metadata === undefined || Object.keys(metadata).length === 0) {
    return "";
  }

  return ` ${JSON.stringify(metadata)}`;
}

export function createStderrBufferLogger(): BufferingLogger {
  const buffer: string[] = [];

  const append = (
    level: "INFO" | "WARN" | "ERROR",
    scope: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void => {
    const line = `${new Date().toISOString()} ${level} [${scope}] ${message}${formatMetadata(metadata)}`;
    buffer.push(line);
    // stderr only — stdout is reserved for JSON-RPC.
    process.stderr.write(`${line}\n`);
  };

  const logger: Logger = {
    info(scope, message, metadata) {
      append("INFO", scope, message, metadata);
    },
    warn(scope, message, metadata) {
      append("WARN", scope, message, metadata);
    },
    error(scope, message, metadata) {
      append("ERROR", scope, message, metadata);
    },
  };

  return {
    logger,
    drain() {
      return [...buffer];
    },
  };
}
