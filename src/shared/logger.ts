import process from "node:process";

export interface Logger {
  info(scope: string, message: string, metadata?: Record<string, unknown>): void;
  warn(scope: string, message: string, metadata?: Record<string, unknown>): void;
  error(scope: string, message: string, metadata?: Record<string, unknown>): void;
}

function formatMetadata(metadata?: Record<string, unknown>): string {
  if (metadata === undefined || Object.keys(metadata).length === 0) {
    return "";
  }

  return ` ${JSON.stringify(metadata)}`;
}

function write(level: "INFO" | "WARN" | "ERROR", scope: string, message: string, metadata?: Record<string, unknown>): void {
  const line = `${new Date().toISOString()} ${level} [${scope}] ${message}${formatMetadata(metadata)}\n`;
  const stream = level === "ERROR" ? process.stderr : process.stdout;
  stream.write(line);
}

export function createLogger(): Logger {
  return {
    info(scope, message, metadata) {
      write("INFO", scope, message, metadata);
    },
    warn(scope, message, metadata) {
      write("WARN", scope, message, metadata);
    },
    error(scope, message, metadata) {
      write("ERROR", scope, message, metadata);
    },
  };
}

export function createChildLogger(base: Logger, prefix: string): Logger {
  return {
    info(scope, message, metadata) {
      base.info(`${prefix}:${scope}`, message, metadata);
    },
    warn(scope, message, metadata) {
      base.warn(`${prefix}:${scope}`, message, metadata);
    },
    error(scope, message, metadata) {
      base.error(`${prefix}:${scope}`, message, metadata);
    },
  };
}
