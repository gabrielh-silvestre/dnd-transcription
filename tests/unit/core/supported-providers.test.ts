import { describe, expect, it } from "@jest/globals";

import { DefaultTranscriberBindingFactory } from "../../../src/core/default-transcriber-binding-factory.js";
import {
  isSupportedProvider,
  SUPPORTED_PROVIDERS,
  unsupportedProviderMessage,
} from "../../../src/core/supported-providers.js";
import { MCP_PROVIDER_ENV_VAR, resolveInfra } from "../../../src/mcp/resolve-infra.js";

// Env that satisfies every openai-* provider so the only thing under test is the
// provider-set parity, not credential validation.
const FULL_ENV: NodeJS.ProcessEnv = {
  OPENAI_API_KEY: "sk-test",
  OPENAI_TRANSCRIPTION_MODEL: "whisper-1",
};

const UNKNOWN_PROVIDER = "provider-inexistente";

describe("supported providers (single source of truth)", () => {
  it("expoe exatamente fake + os dois providers openai", () => {
    expect([...SUPPORTED_PROVIDERS]).toStrictEqual([
      "fake",
      "openai-whisper",
      "openai-transcription",
    ]);
  });

  it("isSupportedProvider reconhece a lista e rejeita o resto", () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(isSupportedProvider(provider)).toBe(true);
    }

    expect(isSupportedProvider(UNKNOWN_PROVIDER)).toBe(false);
    expect(isSupportedProvider("")).toBe(false);
  });

  // PARITY: the core binding factory and the MCP startup dispatch must accept the
  // SAME provider set. If one grows/shrinks without the other, this fails.
  it("a factory do core aceita todos os SUPPORTED_PROVIDERS", () => {
    const factory = new DefaultTranscriberBindingFactory({ env: FULL_ENV });

    for (const provider of SUPPORTED_PROVIDERS) {
      expect(() => factory.create({ provider, chunkDurationMs: 60_000 })).not.toThrow();
    }
  });

  it("o resolveInfra do MCP aceita todos os SUPPORTED_PROVIDERS", () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(() => resolveInfra({ ...FULL_ENV, [MCP_PROVIDER_ENV_VAR]: provider })).not.toThrow();
    }
  });

  it("provider desconhecido falha nos DOIS pontos com a MESMA mensagem", () => {
    const factory = new DefaultTranscriberBindingFactory({ env: FULL_ENV });
    const expected = unsupportedProviderMessage(UNKNOWN_PROVIDER);

    expect(() => factory.create({ provider: UNKNOWN_PROVIDER, chunkDurationMs: 60_000 })).toThrow(
      expected,
    );
    expect(() =>
      resolveInfra({ ...FULL_ENV, [MCP_PROVIDER_ENV_VAR]: UNKNOWN_PROVIDER }),
    ).toThrow(expected);
  });
});
