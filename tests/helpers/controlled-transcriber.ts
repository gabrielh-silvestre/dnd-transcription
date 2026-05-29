import { type TranscriptionRequest, type TranscriptionResult } from "../../src/domain/entities/transcription-result.js";
import { createTranscriberSignature, type Transcriber } from "../../src/domain/ports/transcriber.js";

export class ControlledTranscriber implements Transcriber {
  public readonly name = "fake";
  public readonly signature: string;
  private readonly failuresRemaining: Map<number, number>;

  public constructor(
    failuresRemaining: Record<number, number>,
    signature = createTranscriberSignature({
      provider: "fake",
      variant: "controlled",
    }),
  ) {
    this.failuresRemaining = new Map(Object.entries(failuresRemaining).map(([key, value]) => [Number(key), value]));
    this.signature = signature;
  }

  public async transcribe(input: TranscriptionRequest): Promise<TranscriptionResult> {
    const remaining = this.failuresRemaining.get(input.chunkIndex) ?? 0;

    if (remaining > 0) {
      this.failuresRemaining.set(input.chunkIndex, remaining - 1);
      throw new Error(`falha planejada para chunk ${input.chunkIndex}`);
    }

    return {
      chunkIndex: input.chunkIndex,
      markdown: `Markdown do chunk ${input.chunkIndex}`,
    };
  }
}
