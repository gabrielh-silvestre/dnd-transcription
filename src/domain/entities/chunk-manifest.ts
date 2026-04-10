export interface ChunkManifestEntry {
  index: number;
  startMs: number;
  endMs: number;
  chunkPath: string;
}

export interface ChunkManifest {
  version: 1;
  createdAt: string;
  inputPath: string;
  chunkDurationMs: number;
  totalDurationMs: number;
  chunks: ChunkManifestEntry[];
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

export function createChunkManifest(input: {
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

  return {
    version: 1,
    createdAt: input.createdAt ?? new Date().toISOString(),
    inputPath: input.inputPath,
    chunkDurationMs: input.chunkDurationMs,
    totalDurationMs: input.totalDurationMs,
    chunks,
  };
}
