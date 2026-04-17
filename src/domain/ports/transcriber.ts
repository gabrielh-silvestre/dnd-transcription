import { type TranscriptionRequest, type TranscriptionResult } from "../entities/transcription-result.js";

export type TranscriberSignatureValue = string | number | boolean | null | undefined;

export function createTranscriberSignature(components: Record<string, TranscriberSignatureValue>): string {
  const normalizedEntries = Object.entries(components)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, value ?? null]);

  return JSON.stringify(Object.fromEntries(normalizedEntries));
}

export interface Transcriber {
  readonly name: string;
  readonly signature: string;
  transcribe(input: TranscriptionRequest): Promise<TranscriptionResult>;
}
