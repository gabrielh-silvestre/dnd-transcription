import { describe, expect, it } from "@jest/globals";

import {
  assertChunkFitsUploadLimit,
  createOpenAIWhisperConfig,
  OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
  OPENAI_WHISPER_MODEL,
  OPENAI_WHISPER_RESPONSE_FORMAT,
} from "../../src/infrastructure/providers/openai-whisper-config.js";

describe("OpenAI whisper config", () => {
  it("exige OPENAI_API_KEY", () => {
    expect(() => {
      createOpenAIWhisperConfig({});
    }).toThrow(/OPENAI_API_KEY/);
  });

  it("normaliza ambiente e monta assinatura estavel", () => {
    const config = createOpenAIWhisperConfig({
      OPENAI_API_KEY: " sk-test ",
      OPENAI_WHISPER_LANGUAGE: " PT-BR ",
      OPENAI_WHISPER_PROMPT: " glossario do dominio ",
    });

    expect(config.apiKey).toBe("sk-test");
    expect(config.backend).toBe("openai");
    expect(config.model).toBe(OPENAI_WHISPER_MODEL);
    expect(config.requestModel).toBe(OPENAI_WHISPER_MODEL);
    expect(config.responseFormat).toBe(OPENAI_WHISPER_RESPONSE_FORMAT);
    expect(config.language).toBe("pt-br");
    expect(config.prompt).toBe("glossario do dominio");
    expect(config.transcriberSignature).toBe(
      "{\"language\":\"pt-br\",\"model\":\"whisper-1\",\"prompt\":\"glossario do dominio\",\"provider\":\"openai-whisper\",\"responseFormat\":\"json\"}",
    );
  });

  it("rejeita chunk oversized no preflight", () => {
    expect(() => {
      assertChunkFitsUploadLimit({
        chunkDurationMs: 600_000,
        uploadLimitBytes: OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
      });
    }).not.toThrow();

    expect(() => {
      assertChunkFitsUploadLimit({
        chunkDurationMs: 800_000,
        uploadLimitBytes: OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
      });
    }).toThrow(/uploadLimitBytes/);
  });
});
