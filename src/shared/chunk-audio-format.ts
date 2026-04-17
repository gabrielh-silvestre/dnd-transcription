export const chunkAudioFormat = Object.freeze({
  container: "wav",
  codec: "pcm_s16le",
  sampleFormat: "s16",
  bitsPerSample: 16,
  channels: 1,
  sampleRateHz: 16_000,
  wavHeaderBytes: 44,
});

export const chunkAudioBytesPerSecond = (
  chunkAudioFormat.channels
  * (chunkAudioFormat.bitsPerSample / 8)
  * chunkAudioFormat.sampleRateHz
);

export function estimateChunkAudioSizeBytes(chunkDurationMs: number): number {
  if (!Number.isFinite(chunkDurationMs) || chunkDurationMs <= 0) {
    throw new Error(`chunkDurationMs invalido: ${chunkDurationMs}`);
  }

  return chunkAudioFormat.wavHeaderBytes + Math.ceil((chunkDurationMs * chunkAudioBytesPerSecond) / 1_000);
}
