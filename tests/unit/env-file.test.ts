import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { loadEnvFile, parseEnvFile } from "../../src/shared/env-file.js";
import { createTempDir } from "../helpers/temp-dir.js";

test("parseEnvFile suporta comments, export e quoted values", () => {
  const parsed = parseEnvFile([
    "# comentario",
    "OPENAI_API_KEY=sk-test",
    "export OPENAI_WHISPER_LANGUAGE=pt",
    "OPENAI_WHISPER_PROMPT=\"glossario do dominio\"",
    "INLINE_COMMENT=value # comentario",
  ].join("\n"));

  assert.deepEqual(parsed, {
    OPENAI_API_KEY: "sk-test",
    OPENAI_WHISPER_LANGUAGE: "pt",
    OPENAI_WHISPER_PROMPT: "glossario do dominio",
    INLINE_COMMENT: "value",
  });
});

test("loadEnvFile carrega .env sem sobrescrever variaveis existentes", async (context) => {
  const root = await createTempDir("env-file", context);
  await writeFile(join(root, ".env"), [
    "OPENAI_API_KEY=sk-from-dotenv",
    "OPENAI_WHISPER_LANGUAGE=pt",
    "OPENAI_WHISPER_PROMPT=glossario",
  ].join("\n"), "utf8");

  const env = await loadEnvFile({
    cwd: root,
    env: {
      OPENAI_API_KEY: "sk-from-shell",
    },
  });

  assert.equal(env.OPENAI_API_KEY, "sk-from-shell");
  assert.equal(env.OPENAI_WHISPER_LANGUAGE, "pt");
  assert.equal(env.OPENAI_WHISPER_PROMPT, "glossario");
});

test("loadEnvFile ignora ausencia de .env", async (context) => {
  const root = await createTempDir("env-file-missing", context);

  const env = await loadEnvFile({
    cwd: root,
    env: {
      OPENAI_API_KEY: "sk-test",
    },
  });

  assert.equal(env.OPENAI_API_KEY, "sk-test");
});
