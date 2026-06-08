import { describe, expect, it } from "@jest/globals";

import { resolve } from "node:path";

import {
  createPerCallBindingThunk,
  MCP_ALLOWED_ROOT_ENV_VAR,
  MCP_PROVIDER_ENV_VAR,
  resolveInfra,
  type ResolvedInfra,
} from "../../../src/mcp/resolve-infra.js";
import { ValidationError } from "../../../src/shared/errors.js";

describe("resolveInfra", () => {
  it("resolve infra valida para openai-whisper a partir de env valido", () => {
    const infra = resolveInfra({
      [MCP_PROVIDER_ENV_VAR]: "openai-whisper",
      OPENAI_API_KEY: "sk-test",
    });

    expect(infra.provider).toBe("openai-whisper");
    expect(infra.backend).toBe("openai");
    expect(infra.model).toBe("whisper-1");
    expect(infra.bindingFactory).toBeDefined();
  });

  it("resolve infra valida para openai-transcription com model exigido", () => {
    const infra = resolveInfra({
      [MCP_PROVIDER_ENV_VAR]: "openai-transcription",
      OPENAI_API_KEY: "sk-test",
      OPENAI_TRANSCRIPTION_MODEL: "whisper-1",
    });

    expect(infra.provider).toBe("openai-transcription");
    expect(infra.backend).toBe("openai");
    expect(infra.model).toBe("whisper-1");
  });

  it("resolve o provider fake sem exigir secrets (model null)", () => {
    const infra = resolveInfra({ [MCP_PROVIDER_ENV_VAR]: "fake" });

    expect(infra.provider).toBe("fake");
    expect(infra.backend).toBe("fake");
    expect(infra.model).toBeNull();
  });

  it("allowedRoot e null quando MCP_ALLOWED_ROOT esta ausente (sem contencao)", () => {
    const infra = resolveInfra({ [MCP_PROVIDER_ENV_VAR]: "fake" });

    expect(infra.allowedRoot).toBeNull();
  });

  it("allowedRoot e null quando MCP_ALLOWED_ROOT esta em branco", () => {
    const infra = resolveInfra({ [MCP_PROVIDER_ENV_VAR]: "fake", [MCP_ALLOWED_ROOT_ENV_VAR]: "   " });

    expect(infra.allowedRoot).toBeNull();
  });

  it("allowedRoot e resolvido para caminho absoluto quando MCP_ALLOWED_ROOT esta setado", () => {
    const infra = resolveInfra({
      [MCP_PROVIDER_ENV_VAR]: "fake",
      [MCP_ALLOWED_ROOT_ENV_VAR]: "./media",
    });

    expect(infra.allowedRoot).toBe(resolve("./media"));
  });

  it("lanca quando MCP_TRANSCRIPTION_PROVIDER esta ausente", () => {
    expect(() => resolveInfra({})).toThrow(ValidationError);
    expect(() => resolveInfra({})).toThrow(new RegExp(MCP_PROVIDER_ENV_VAR));
  });

  it("lanca quando OPENAI_API_KEY falta para openai-whisper (fail-fast R3)", () => {
    expect(() =>
      resolveInfra({ [MCP_PROVIDER_ENV_VAR]: "openai-whisper" }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("lanca quando OPENAI_TRANSCRIPTION_MODEL falta para openai-transcription (fail-fast R3)", () => {
    expect(() =>
      resolveInfra({
        [MCP_PROVIDER_ENV_VAR]: "openai-transcription",
        OPENAI_API_KEY: "sk-test",
      }),
    ).toThrow(/OPENAI_TRANSCRIPTION_MODEL/);
  });

  it("lanca quando backend azure esta incompleto (endpoint ausente)", () => {
    expect(() =>
      resolveInfra({
        [MCP_PROVIDER_ENV_VAR]: "openai-transcription",
        OPENAI_TRANSCRIPTION_MODEL: "whisper-1",
        OPENAI_TRANSCRIPTION_BACKEND: "azure",
        AZURE_OPENAI_API_KEY: "az-key",
        OPENAI_API_VERSION: "2024-06-01",
      }),
    ).toThrow(/AZURE_OPENAI_ENDPOINT/);
  });

  it("lanca para provider desconhecido", () => {
    expect(() =>
      resolveInfra({ [MCP_PROVIDER_ENV_VAR]: "provider-inexistente" }),
    ).toThrow(ValidationError);
  });

  it("a ResolvedInfra nunca expoe um campo apiKey/secret", () => {
    const infra = resolveInfra({
      [MCP_PROVIDER_ENV_VAR]: "openai-whisper",
      OPENAI_API_KEY: "sk-super-secreta",
    });

    // The ResolvedInfra surface the gateway holds/serializes for health/output
    // exposes only non-sensitive labels + the binding factory; no secret field.
    const keys = Object.keys(infra as unknown as Record<string, unknown>);
    expect(keys.sort()).toStrictEqual(["allowedRoot", "backend", "bindingFactory", "model", "provider"].sort());
    expect(keys).not.toContain("apiKey");
    expect(keys).not.toContain("endpoint");
    expect(keys).not.toContain("secret");
  });
});

describe("createPerCallBindingThunk", () => {
  it("delega ao bindingFactory.create com o provider da infra e o chunkDurationMs do request", () => {
    const calls: Array<{ provider: string; chunkDurationMs: number }> = [];
    const fakeBinding = { signature: "sig", createTranscriber: () => ({}) } as never;

    const infra: ResolvedInfra = {
      provider: "openai-whisper",
      backend: "openai",
      model: "whisper-1",
      allowedRoot: null,
      bindingFactory: {
        create(options) {
          calls.push(options);
          return fakeBinding;
        },
      },
    };

    const thunk = createPerCallBindingThunk(infra, 120_000);
    const binding = thunk("/abs/input.mkv");

    expect(binding).toBe(fakeBinding);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.provider).toBe("openai-whisper");
    expect(calls[0]!.chunkDurationMs).toBe(120_000);
  });
});
