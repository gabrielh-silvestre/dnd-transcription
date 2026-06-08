import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  classifyBatchFileResult,
  countBatchFailures,
  type BatchFileResult,
  type TranscriptionCoreResult,
} from "../core/transcription-core.js";

/**
 * Builds the human-readable summary text for a batch result, replicating the
 * per-file partial-failure detail that the CLI emits via `logBatchSummary`
 * (which stays CLI-only). This keeps partial-failure detail visible to the
 * agent in the tool result's `content` even though the core no longer logs it.
 */
export function summarizeBatch(result: TranscriptionCoreResult): string {
  const total = result.fileResults.length;
  const failures = countBatchFailures(result.fileResults);

  const lines = [
    `Batch concluido. exitCode=${result.exitCode} total=${total} failures=${failures}.`,
  ];

  for (const file of result.fileResults) {
    if (file.exitCode === 0) {
      continue;
    }

    const kind = classifyBatchFileResult(file.exitCode) === "partial" ? "falha parcial" : "erro fatal";
    lines.push(formatFailureLine(kind, file));
  }

  return lines.join("\n");
}

function formatFailureLine(kind: string, file: BatchFileResult): string {
  const parts = [
    `- [${kind}] inputPath=${file.inputPath}`,
    `exitCode=${file.exitCode}`,
  ];

  if (file.subdir !== null) {
    parts.push(`subdir=${file.subdir}`);
  }

  if (file.errorSummary !== undefined && file.errorSummary !== null) {
    parts.push(`error=${file.errorSummary}`);
  }

  return parts.join(" ");
}

/**
 * Maps the structured core result onto a {@link CallToolResult}. The previously
 * swallowed `{ exitCode, fileResults }` is surfaced as `structuredContent`;
 * `content` carries the human-readable summary plus any buffered log lines.
 *
 * exitCode 0 -> success; exitCode 1|2 -> same shape with `isError: true` so the
 * agent can self-correct on partial/fatal failures while still seeing per-file
 * detail.
 */
export function mapResultToToolOutput(
  result: TranscriptionCoreResult,
  logLines: string[],
): CallToolResult {
  const summary = summarizeBatch(result);
  const text = logLines.length > 0
    ? `${summary}\n\n--- log ---\n${logLines.join("\n")}`
    : summary;

  const output: CallToolResult = {
    content: [{ type: "text", text }],
    structuredContent: {
      exitCode: result.exitCode,
      fileResults: result.fileResults.map((f) => ({ ...f })),
    },
  };

  if (result.exitCode !== 0) {
    output.isError = true;
  }

  return output;
}

/**
 * Maps a thrown error (the core does NOT swallow — see ERROR-BOUNDARY SPLIT)
 * onto an `isError` {@link CallToolResult}, attaching any buffered log lines.
 */
export function mapErrorToToolOutput(error: unknown, logLines: string[]): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const text = logLines.length > 0
    ? `Falha na transcricao: ${message}\n\n--- log ---\n${logLines.join("\n")}`
    : `Falha na transcricao: ${message}`;

  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}
