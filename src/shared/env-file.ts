import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseQuotedValue(value: string, quote: "\"" | "'"): string {
  if (!value.endsWith(quote)) {
    throw new Error(`Valor quoted invalido em .env: ${value}`);
  }

  const inner = value.slice(1, -1);

  if (quote === "'") {
    return inner;
  }

  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function parseUnquotedValue(value: string): string {
  const commentIndex = value.search(/\s#/u);

  if (commentIndex >= 0) {
    return value.slice(0, commentIndex).trimEnd();
  }

  return value.trimEnd();
}

export function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const lines = content.split(/\r?\n/u);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const separatorIndex = withoutExport.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(`Linha invalida em .env: ${rawLine}`);
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    const rawValue = withoutExport.slice(separatorIndex + 1).trimStart();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      throw new Error(`Chave invalida em .env: ${key}`);
    }

    let value: string;

    if (rawValue.startsWith("\"") || rawValue.startsWith("'")) {
      value = parseQuotedValue(rawValue, rawValue[0] as "\"" | "'");
    } else {
      value = parseUnquotedValue(rawValue);
    }

    parsed[key] = value;
  }

  return parsed;
}

export async function loadEnvFile(input: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fileName?: string;
} = {}): Promise<NodeJS.ProcessEnv> {
  const cwd = input.cwd ?? process.cwd();
  const fileName = input.fileName ?? ".env";
  const env = { ...(input.env ?? process.env) };
  const path = resolve(cwd, fileName);

  try {
    const content = await readFile(path, "utf8");
    const parsed = parseEnvFile(content);

    for (const [key, value] of Object.entries(parsed)) {
      if (env[key] === undefined) {
        env[key] = value;
      }
    }

    return env;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return env;
    }

    throw error;
  }
}
