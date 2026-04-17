import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { type TranscriptionRequest, type TranscriptionResult } from "../../domain/entities/transcription-result.js";
import { createTranscriberSignature, type Transcriber } from "../../domain/ports/transcriber.js";
import { formatChunkIndex } from "../../shared/paths.js";

export interface FakeTranscriberOptions {
  latencyMs?: number;
  failChunkIndexes?: number[];
}

export function resolveFakeTranscriberOptions(env: NodeJS.ProcessEnv = process.env): FakeTranscriberOptions {
  const latencyMs = env.FAKE_TRANSCRIBER_LATENCY_MS === undefined
    ? 10
    : Number.parseInt(env.FAKE_TRANSCRIBER_LATENCY_MS, 10);
  const failChunkIndexes = (env.FAKE_TRANSCRIBER_FAIL_CHUNKS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  return {
    latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 10,
    failChunkIndexes,
  };
}

export function createFakeTranscriberSignature(options: FakeTranscriberOptions = {}): string {
  const latencyMs = options.latencyMs ?? 10;
  const failChunkIndexes = [...new Set(options.failChunkIndexes ?? [])]
    .sort((left, right) => left - right)
    .join(",");

  return createTranscriberSignature({
    provider: "fake",
    latencyMs,
    failChunkIndexes,
  });
}

export class FakeTranscriber implements Transcriber {
  public readonly name = "fake";
  public readonly signature: string;
  private readonly latencyMs: number;
  private readonly failChunkIndexes: Set<number>;

  public constructor(options: FakeTranscriberOptions = {}) {
    this.latencyMs = options.latencyMs ?? 10;
    this.failChunkIndexes = new Set(options.failChunkIndexes ?? []);
    this.signature = createFakeTranscriberSignature({
      latencyMs: this.latencyMs,
      failChunkIndexes: [...this.failChunkIndexes],
    });
  }

  public static fromEnvironment(env: NodeJS.ProcessEnv = process.env): FakeTranscriber {
    return new FakeTranscriber(resolveFakeTranscriberOptions(env));
  }

  public async transcribe(input: TranscriptionRequest): Promise<TranscriptionResult> {
    if (this.latencyMs > 0) {
      await delay(this.latencyMs);
    }

    if (this.failChunkIndexes.has(input.chunkIndex)) {
      throw new Error(`Fake transcriber configured to fail chunk ${input.chunkIndex}`);
    }

    return {
      chunkIndex: input.chunkIndex,
      markdown: [
        `Transcricao fake do chunk ${formatChunkIndex(input.chunkIndex)}.`,
        `Arquivo: ${basename(input.audioPath)}.`,
        `Janela: ${input.startMs}ms-${input.endMs}ms.`,
      ].join("\n"),
      providerMetadata: {
        provider: "fake",
        chunkIndex: input.chunkIndex,
      },
    };
  }
}
