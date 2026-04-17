import assert from "node:assert/strict";
import test from "node:test";

import {
  assertChunkFitsUploadLimit,
  createOpenAIWhisperConfig,
  OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
  OPENAI_WHISPER_MODEL,
  OPENAI_WHISPER_RESPONSE_FORMAT,
} from "../../src/infrastructure/providers/openai-whisper-config.js";

test("createOpenAIWhisperConfig exige OPENAI_API_KEY", () => {
  assert.throws(() => {
    createOpenAIWhisperConfig({});
  }, /OPENAI_API_KEY/);
});

test("createOpenAIWhisperConfig normaliza ambiente e monta assinatura estavel", () => {
  const config = createOpenAIWhisperConfig({
    OPENAI_API_KEY: " sk-test ",
    OPENAI_WHISPER_LANGUAGE: " PT-BR ",
    OPENAI_WHISPER_PROMPT: " glossario do dominio ",
  });

  assert.equal(config.apiKey, "sk-test");
  assert.equal(config.backend, "openai");
  assert.equal(config.model, OPENAI_WHISPER_MODEL);
  assert.equal(config.requestModel, OPENAI_WHISPER_MODEL);
  assert.equal(config.responseFormat, OPENAI_WHISPER_RESPONSE_FORMAT);
  assert.equal(config.language, "pt-br");
  assert.equal(config.prompt, "glossario do dominio");
  assert.equal(
    config.transcriberSignature,
    "{\"language\":\"pt-br\",\"model\":\"whisper-1\",\"prompt\":\"glossario do dominio\",\"provider\":\"openai-whisper\",\"responseFormat\":\"json\"}",
  );
});

test("assertChunkFitsUploadLimit rejeita chunk oversized no preflight", () => {
  assert.doesNotThrow(() => {
    assertChunkFitsUploadLimit({
      chunkDurationMs: 600_000,
      uploadLimitBytes: OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
    });
  });

  assert.throws(() => {
    assertChunkFitsUploadLimit({
      chunkDurationMs: 800_000,
      uploadLimitBytes: OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
    });
  }, /uploadLimitBytes/);
});
