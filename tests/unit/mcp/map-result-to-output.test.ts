import { describe, expect, it } from "@jest/globals";

import {
  mapErrorToToolOutput,
  mapResultToToolOutput,
  summarizeBatch,
} from "../../../src/mcp/map-result-to-output.js";
import {
  type BatchFileResult,
  type TranscriptionCoreResult,
} from "../../../src/core/transcription-core.js";

function fileResult(overrides: Partial<BatchFileResult> & { inputPath: string }): BatchFileResult {
  return {
    subdir: null,
    exitCode: 0,
    jobStatus: "succeeded",
    failedChunks: [],
    finalMarkdownPath: "transcript.md",
    errorSummary: null,
    ...overrides,
  };
}

describe("mapResultToToolOutput", () => {
  it("exitCode 0 => sem isError, com structuredContent { exitCode, fileResults }", () => {
    const result: TranscriptionCoreResult = {
      exitCode: 0,
      fileResults: [fileResult({ inputPath: "/a.mkv" })],
    };

    const output = mapResultToToolOutput(result, []);

    expect(output.isError).toBeUndefined();
    expect(output.structuredContent).toMatchObject({ exitCode: 0 });
    expect((output.structuredContent as { fileResults: unknown[] }).fileResults).toHaveLength(1);
    expect(output.content[0]).toMatchObject({ type: "text" });
  });

  it("exitCode 1 => isError true mantendo structuredContent", () => {
    const result: TranscriptionCoreResult = {
      exitCode: 1,
      fileResults: [fileResult({ inputPath: "/a.mkv", exitCode: 1, jobStatus: "fatal_error", errorSummary: "boom" })],
    };

    const output = mapResultToToolOutput(result, []);

    expect(output.isError).toBe(true);
    expect(output.structuredContent).toMatchObject({ exitCode: 1 });
  });

  it("exitCode 2 => isError true (falha parcial) com structuredContent", () => {
    const result: TranscriptionCoreResult = {
      exitCode: 2,
      fileResults: [fileResult({ inputPath: "/a.mkv", exitCode: 2, jobStatus: "partial_failed", failedChunks: [1] })],
    };

    const output = mapResultToToolOutput(result, []);

    expect(output.isError).toBe(true);
    expect(output.structuredContent).toMatchObject({ exitCode: 2 });
  });

  it("preserva fileResults (multi) no structuredContent e revela subdir nas falhas", () => {
    const result: TranscriptionCoreResult = {
      exitCode: 2,
      fileResults: [
        fileResult({ inputPath: "/a.mkv", subdir: "a-1111" }),
        fileResult({ inputPath: "/b.mkv", subdir: "b-2222", exitCode: 2, jobStatus: "partial_failed", failedChunks: [3], errorSummary: "parcial" }),
      ],
    };

    const output = mapResultToToolOutput(result, []);
    const structured = output.structuredContent as { fileResults: BatchFileResult[] };

    expect(structured.fileResults).toHaveLength(2);
    const text = (output.content[0] as { text: string }).text;
    expect(text).toMatch(/b\.mkv/);
    expect(text).toMatch(/subdir=b-2222/);
    expect(text).toMatch(/parcial/);
  });

  it("anexa as linhas de log capturadas no content quando presentes", () => {
    const result: TranscriptionCoreResult = {
      exitCode: 0,
      fileResults: [fileResult({ inputPath: "/a.mkv" })],
    };

    const output = mapResultToToolOutput(result, ["INFO [batch] ok"]);
    const text = (output.content[0] as { text: string }).text;

    expect(text).toMatch(/--- log ---/);
    expect(text).toMatch(/INFO \[batch\] ok/);
  });
});

describe("summarizeBatch", () => {
  it("conta total e failures e detalha cada arquivo com falha", () => {
    const summary = summarizeBatch({
      exitCode: 2,
      fileResults: [
        fileResult({ inputPath: "/ok.mkv" }),
        fileResult({ inputPath: "/bad.mkv", exitCode: 2, jobStatus: "partial_failed", failedChunks: [1], errorSummary: "x" }),
      ],
    });

    expect(summary).toMatch(/total=2/);
    expect(summary).toMatch(/failures=1/);
    expect(summary).toMatch(/falha parcial/);
    expect(summary).toMatch(/bad\.mkv/);
  });
});

describe("mapErrorToToolOutput", () => {
  it("converte um throw em isError com a mensagem do erro", () => {
    const output = mapErrorToToolOutput(new Error("chunk grande demais"), []);

    expect(output.isError).toBe(true);
    expect((output.content[0] as { text: string }).text).toMatch(/chunk grande demais/);
    expect(output.structuredContent).toBeUndefined();
  });

  it("anexa o buffer de log quando houver linhas", () => {
    const output = mapErrorToToolOutput(new Error("falhou"), ["ERROR [job] detalhe"]);

    expect((output.content[0] as { text: string }).text).toMatch(/ERROR \[job\] detalhe/);
  });
});
