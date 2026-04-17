import assert from "node:assert/strict";
import test from "node:test";

import {
  assertChunkFitsUploadLimit,
  createOpenAITranscriptionConfig,
  OPENAI_TRANSCRIPTION_RESPONSE_FORMAT,
} from "../../src/infrastructure/providers/openai-transcription-config.js";

test("createOpenAITranscriptionConfig exige OPENAI_TRANSCRIPTION_MODEL", () => {
  assert.throws(() => {
    createOpenAITranscriptionConfig({
      OPENAI_API_KEY: "sk-test",
    });
  }, /OPENAI_TRANSCRIPTION_MODEL/);
});

test("createOpenAITranscriptionConfig usa backend openai por padrao e monta assinatura estavel", () => {
  const config = createOpenAITranscriptionConfig({
    OPENAI_API_KEY: " sk-test ",
    OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
    OPENAI_TRANSCRIPTION_LANGUAGE: " PT-BR ",
    OPENAI_TRANSCRIPTION_PROMPT: " glossario do dominio ",
  });

  assert.equal(config.backend, "openai");
  assert.equal(config.apiKey, "sk-test");
  assert.equal(config.model, "gpt-4o-mini-transcribe");
  assert.equal(config.requestModel, "gpt-4o-mini-transcribe");
  assert.equal(config.responseFormat, OPENAI_TRANSCRIPTION_RESPONSE_FORMAT);
  assert.equal(config.language, "pt-br");
  assert.equal(config.prompt, "glossario do dominio");
  assert.equal(
    config.transcriberSignature,
    "{\"apiVersion\":null,\"backend\":\"openai\",\"deployment\":null,\"endpoint\":null,\"language\":\"pt-br\",\"model\":\"gpt-4o-mini-transcribe\",\"prompt\":\"glossario do dominio\",\"provider\":\"openai-transcription\",\"responseFormat\":\"json\"}",
  );
});

test("createOpenAITranscriptionConfig suporta backend azure com deployment opcional", () => {
  const config = createOpenAITranscriptionConfig({
    OPENAI_TRANSCRIPTION_BACKEND: "azure",
    OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe",
    AZURE_OPENAI_API_KEY: " azure-key ",
    AZURE_OPENAI_ENDPOINT: " https://example-resource.azure.openai.com/ ",
    OPENAI_API_VERSION: " 2025-03-01-preview ",
    AZURE_OPENAI_DEPLOYMENT: " transcribe-prod ",
  });

  assert.equal(config.backend, "azure");
  assert.equal(config.apiKey, "azure-key");
  assert.equal(config.endpoint, "https://example-resource.azure.openai.com");
  assert.equal(config.apiVersion, "2025-03-01-preview");
  assert.equal(config.deployment, "transcribe-prod");
  assert.equal(config.requestModel, "transcribe-prod");
  assert.equal(
    config.transcriberSignature,
    "{\"apiVersion\":\"2025-03-01-preview\",\"backend\":\"azure\",\"deployment\":\"transcribe-prod\",\"endpoint\":\"https://example-resource.azure.openai.com\",\"language\":null,\"model\":\"gpt-4o-transcribe\",\"prompt\":null,\"provider\":\"openai-transcription\",\"responseFormat\":\"json\"}",
  );
});

test("createOpenAITranscriptionConfig rejeita backend e modelo invalidos", () => {
  assert.throws(() => {
    createOpenAITranscriptionConfig({
      OPENAI_TRANSCRIPTION_BACKEND: "bedrock",
      OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
      OPENAI_API_KEY: "sk-test",
    });
  }, /OPENAI_TRANSCRIPTION_BACKEND/);

  assert.throws(() => {
    createOpenAITranscriptionConfig({
      OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe-diarize",
      OPENAI_API_KEY: "sk-test",
    });
  }, /OPENAI_TRANSCRIPTION_MODEL/);
});

test("openai-transcription reutiliza o preflight de chunk oversized", () => {
  assert.doesNotThrow(() => {
    assertChunkFitsUploadLimit({
      chunkDurationMs: 600_000,
    });
  });

  assert.throws(() => {
    assertChunkFitsUploadLimit({
      chunkDurationMs: 800_000,
    });
  }, /openai-transcription/);
});
