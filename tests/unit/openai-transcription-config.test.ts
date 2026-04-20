import { describe, expect, it } from "@jest/globals";

import {
  assertChunkFitsUploadLimit,
  createOpenAITranscriptionConfig,
  OPENAI_TRANSCRIPTION_RESPONSE_FORMAT,
} from "../../src/infrastructure/providers/openai-transcription-config.js";

describe("OpenAI transcription config", () => {
  describe("createOpenAITranscriptionConfig", () => {
    it("exige OPENAI_TRANSCRIPTION_MODEL", () => {
      expect(() => {
        createOpenAITranscriptionConfig({
          OPENAI_API_KEY: "sk-test",
        });
      }).toThrow(/OPENAI_TRANSCRIPTION_MODEL/);
    });

    it("usa backend openai por padrao e monta assinatura estavel", () => {
      const config = createOpenAITranscriptionConfig({
        OPENAI_API_KEY: " sk-test ",
        OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
        OPENAI_TRANSCRIPTION_LANGUAGE: " PT-BR ",
        OPENAI_TRANSCRIPTION_PROMPT: " glossario do dominio ",
      });

      expect(config.backend).toBe("openai");
      expect(config.apiKey).toBe("sk-test");
      expect(config.model).toBe("gpt-4o-mini-transcribe");
      expect(config.requestModel).toBe("gpt-4o-mini-transcribe");
      expect(config.responseFormat).toBe(OPENAI_TRANSCRIPTION_RESPONSE_FORMAT);
      expect(config.language).toBe("pt-br");
      expect(config.prompt).toBe("glossario do dominio");
      expect(config.transcriberSignature).toBe(
        "{\"apiVersion\":null,\"backend\":\"openai\",\"deployment\":null,\"endpoint\":null,\"language\":\"pt-br\",\"model\":\"gpt-4o-mini-transcribe\",\"prompt\":\"glossario do dominio\",\"provider\":\"openai-transcription\",\"responseFormat\":\"json\"}",
      );
    });

    it("suporta backend azure com deployment opcional", () => {
      const config = createOpenAITranscriptionConfig({
        OPENAI_TRANSCRIPTION_BACKEND: "azure",
        OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe",
        AZURE_OPENAI_API_KEY: " azure-key ",
        AZURE_OPENAI_ENDPOINT: " https://example-resource.azure.openai.com/ ",
        OPENAI_API_VERSION: " 2025-03-01-preview ",
        AZURE_OPENAI_DEPLOYMENT: " transcribe-prod ",
      });

      expect(config.backend).toBe("azure");
      expect(config.apiKey).toBe("azure-key");
      expect(config.endpoint).toBe("https://example-resource.azure.openai.com");
      expect(config.apiVersion).toBe("2025-03-01-preview");
      expect(config.deployment).toBe("transcribe-prod");
      expect(config.requestModel).toBe("transcribe-prod");
      expect(config.transcriberSignature).toBe(
        "{\"apiVersion\":\"2025-03-01-preview\",\"backend\":\"azure\",\"deployment\":\"transcribe-prod\",\"endpoint\":\"https://example-resource.azure.openai.com\",\"language\":null,\"model\":\"gpt-4o-transcribe\",\"prompt\":null,\"provider\":\"openai-transcription\",\"responseFormat\":\"json\"}",
      );
    });

    it("rejeita backend e modelo invalidos", () => {
      expect(() => {
        createOpenAITranscriptionConfig({
          OPENAI_TRANSCRIPTION_BACKEND: "bedrock",
          OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
          OPENAI_API_KEY: "sk-test",
        });
      }).toThrow(/OPENAI_TRANSCRIPTION_BACKEND/);

      expect(() => {
        createOpenAITranscriptionConfig({
          OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe-diarize",
          OPENAI_API_KEY: "sk-test",
        });
      }).toThrow(/OPENAI_TRANSCRIPTION_MODEL/);
    });
  });

  it("reutiliza o preflight de chunk oversized", () => {
    expect(() => {
      assertChunkFitsUploadLimit({
        chunkDurationMs: 600_000,
      });
    }).not.toThrow();

    expect(() => {
      assertChunkFitsUploadLimit({
        chunkDurationMs: 800_000,
      });
    }).toThrow(/openai-transcription/);
  });
});
