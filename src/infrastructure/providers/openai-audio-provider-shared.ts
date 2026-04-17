import { ValidationError } from "../../shared/errors.js";
import { estimateChunkAudioSizeBytes } from "../../shared/chunk-audio-format.js";

export const OPENAI_AUDIO_RESPONSE_FORMAT = "json" as const;
export const OPENAI_AUDIO_UPLOAD_LIMIT_BYTES = 25_000_000;

export function normalizeOptionalValue(
  rawValue: string | undefined,
  transformer?: (value: string) => string,
): string | null {
  if (rawValue === undefined) {
    return null;
  }

  const normalized = (transformer?.(rawValue) ?? rawValue).trim();

  return normalized.length === 0 ? null : normalized;
}

export function assertOpenAIAudioChunkFitsUploadLimit(input: {
  chunkDurationMs: number;
  provider: string;
  uploadLimitBytes?: number;
}): void {
  const estimatedSizeBytes = estimateChunkAudioSizeBytes(input.chunkDurationMs);
  const uploadLimitBytes = input.uploadLimitBytes ?? OPENAI_AUDIO_UPLOAD_LIMIT_BYTES;

  if (estimatedSizeBytes > uploadLimitBytes) {
    throw new ValidationError(
      [
        `chunk-duration-seconds atual excede o limite estimado de upload do provider ${input.provider}.`,
        `estimatedChunkSizeBytes=${estimatedSizeBytes}.`,
        `uploadLimitBytes=${uploadLimitBytes}.`,
      ].join(" "),
      "provider",
    );
  }
}
