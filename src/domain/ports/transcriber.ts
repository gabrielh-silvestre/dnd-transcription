import { type TranscriptionRequest, type TranscriptionResult } from "../entities/transcription-result.js";

export interface Transcriber {
  readonly name: string;
  transcribe(input: TranscriptionRequest): Promise<TranscriptionResult>;
}
