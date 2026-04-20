import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

import { loadEnvFile, parseEnvFile } from "../../src/shared/env-file.js";
import { createTempDir } from "../helpers/temp-dir.js";

describe("Env file utilities", () => {
  it("suporta comments, export e quoted values", () => {
    const parsed = parseEnvFile([
      "# comentario",
      "OPENAI_API_KEY=sk-test",
      "export OPENAI_WHISPER_LANGUAGE=pt",
      "OPENAI_WHISPER_PROMPT=\"glossario do dominio\"",
      "INLINE_COMMENT=value # comentario",
    ].join("\n"));

    expect(parsed).toStrictEqual({
      OPENAI_API_KEY: "sk-test",
      OPENAI_WHISPER_LANGUAGE: "pt",
      OPENAI_WHISPER_PROMPT: "glossario do dominio",
      INLINE_COMMENT: "value",
    });
  });

  it("carrega .env sem sobrescrever variaveis existentes", async () => {
    const root = await createTempDir("env-file");
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

    expect(env.OPENAI_API_KEY).toBe("sk-from-shell");
    expect(env.OPENAI_WHISPER_LANGUAGE).toBe("pt");
    expect(env.OPENAI_WHISPER_PROMPT).toBe("glossario");
  });

  it("ignora ausencia de .env", async () => {
    const root = await createTempDir("env-file-missing");

    const env = await loadEnvFile({
      cwd: root,
      env: {
        OPENAI_API_KEY: "sk-test",
      },
    });

    expect(env.OPENAI_API_KEY).toBe("sk-test");
  });
});
