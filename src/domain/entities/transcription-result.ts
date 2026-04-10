export interface TranscriptionRequest {
  chunkIndex: number;
  audioPath: string;
  startMs: number;
  endMs: number;
  jobMetadata?: Record<string, string | number | boolean>;
}

export interface TranscriptionResult {
  chunkIndex: number;
  markdown: string;
  providerMetadata?: Record<string, string | number | boolean>;
}
