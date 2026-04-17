export interface ChunkManifestEntry {
  index: number;
  startMs: number;
  endMs: number;
  chunkPath: string;
}

export interface ChunkManifestState {
  version: 1;
  createdAt: string;
  inputPath: string;
  chunkDurationMs: number;
  totalDurationMs: number;
  chunks: ChunkManifestEntry[];
}

function cloneChunkEntry(entry: ChunkManifestEntry): ChunkManifestEntry {
  return {
    index: entry.index,
    startMs: entry.startMs,
    endMs: entry.endMs,
    chunkPath: entry.chunkPath,
  };
}

function freezeChunkEntries(chunks: ChunkManifestEntry[]): readonly ChunkManifestEntry[] {
  return Object.freeze(
    chunks.map((chunk) => Object.freeze(cloneChunkEntry(chunk))),
  );
}

function validateChunk(entry: ChunkManifestEntry): void {
  if (!Number.isInteger(entry.index) || entry.index < 1) {
    throw new Error(`Indice de chunk invalido: ${entry.index}`);
  }

  if (entry.startMs < 0 || entry.endMs <= entry.startMs) {
    throw new Error(`Janela invalida para chunk ${entry.index}`);
  }

  if (entry.chunkPath.trim().length === 0) {
    throw new Error(`chunkPath vazio para chunk ${entry.index}`);
  }
}

export class ChunkManifest {
  public readonly version: 1;
  public readonly createdAt: string;
  public readonly inputPath: string;
  public readonly chunkDurationMs: number;
  public readonly totalDurationMs: number;
  public readonly chunks: readonly ChunkManifestEntry[];

  private constructor(state: ChunkManifestState) {
    this.version = state.version;
    this.createdAt = state.createdAt;
    this.inputPath = state.inputPath;
    this.chunkDurationMs = state.chunkDurationMs;
    this.totalDurationMs = state.totalDurationMs;
    this.chunks = freezeChunkEntries(state.chunks);
  }

  public static create(input: {
    inputPath: string;
    chunkDurationMs: number;
    totalDurationMs: number;
    chunks: ChunkManifestEntry[];
    createdAt?: string;
  }): ChunkManifest {
    const chunks = [...input.chunks].sort((left, right) => left.index - right.index);

    chunks.forEach(validateChunk);

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]!;
      const expectedIndex = index + 1;

      if (chunk.index !== expectedIndex) {
        throw new Error(`Manifesto deve ser sequencial. Esperado ${expectedIndex}, recebido ${chunk.index}.`);
      }

      if (index > 0) {
        const previous = chunks[index - 1]!;

        if (chunk.startMs < previous.endMs) {
          throw new Error(`Manifesto nao e monotono entre ${previous.index} e ${chunk.index}.`);
        }
      }
    }

    return new ChunkManifest({
      version: 1,
      createdAt: input.createdAt ?? new Date().toISOString(),
      inputPath: input.inputPath,
      chunkDurationMs: input.chunkDurationMs,
      totalDurationMs: input.totalDurationMs,
      chunks,
    });
  }

  public static restore(state: ChunkManifestState): ChunkManifest {
    if (state.version !== 1) {
      throw new Error(`Versao de manifest invalida: ${state.version}`);
    }

    return ChunkManifest.create({
      inputPath: state.inputPath,
      chunkDurationMs: state.chunkDurationMs,
      totalDurationMs: state.totalDurationMs,
      createdAt: state.createdAt,
      chunks: state.chunks.map((chunk) => cloneChunkEntry(chunk)),
    });
  }

  public toState(): ChunkManifestState {
    return {
      version: this.version,
      createdAt: this.createdAt,
      inputPath: this.inputPath,
      chunkDurationMs: this.chunkDurationMs,
      totalDurationMs: this.totalDurationMs,
      chunks: this.chunks.map((chunk) => cloneChunkEntry(chunk)),
    };
  }

  public toJSON(): ChunkManifestState {
    return this.toState();
  }
}

export function createChunkManifest(input: {
  inputPath: string;
  chunkDurationMs: number;
  totalDurationMs: number;
  chunks: ChunkManifestEntry[];
  createdAt?: string;
}): ChunkManifest {
  return ChunkManifest.create(input);
}
