export const chunkStatuses = [
  "pending",
  "running",
  "succeeded",
  "failed",
] as const;

export type ChunkStatus = (typeof chunkStatuses)[number];

export interface ChunkState {
  index: number;
  status: ChunkStatus;
  attempts: number;
  errorSummary: string | null;
  markdownPath: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

const allowedChunkTransitions: Record<ChunkStatus, readonly ChunkStatus[]> = {
  pending: ["running"],
  running: ["succeeded", "failed", "pending"],
  succeeded: [],
  failed: ["pending"],
};

function cloneChunkState(state: ChunkState): ChunkState {
  return {
    index: state.index,
    status: state.status,
    attempts: state.attempts,
    errorSummary: state.errorSummary,
    markdownPath: state.markdownPath,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
  };
}

function assertValidChunkIndex(index: number): void {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(`Indice de chunk invalido: ${index}`);
  }
}

function assertValidChunkState(state: ChunkState): void {
  assertValidChunkIndex(state.index);

  if (!Number.isInteger(state.attempts) || state.attempts < 0) {
    throw new Error(`Attempts invalido para chunk ${state.index}: ${state.attempts}`);
  }
}

export class JobChunk {
  private readonly state: ChunkState;

  private constructor(state: ChunkState) {
    this.state = state;
  }

  public static createPending(index: number): JobChunk {
    assertValidChunkIndex(index);

    return new JobChunk({
      index,
      status: "pending",
      attempts: 0,
      errorSummary: null,
      markdownPath: null,
      startedAt: null,
      finishedAt: null,
    });
  }

  public static restore(state: ChunkState): JobChunk {
    assertValidChunkState(state);
    return new JobChunk(cloneChunkState(state));
  }

  public static assertStatusTransition(current: ChunkStatus, next: ChunkStatus): void {
    if (current === next) {
      return;
    }

    if (!allowedChunkTransitions[current].includes(next)) {
      throw new Error(`Transicao de chunk invalida: ${current} -> ${next}`);
    }
  }

  public get index(): number {
    return this.state.index;
  }

  public get status(): ChunkStatus {
    return this.state.status;
  }

  public get attempts(): number {
    return this.state.attempts;
  }

  public get errorSummary(): string | null {
    return this.state.errorSummary;
  }

  public get markdownPath(): string | null {
    return this.state.markdownPath;
  }

  public get startedAt(): string | null {
    return this.state.startedAt;
  }

  public get finishedAt(): string | null {
    return this.state.finishedAt;
  }

  public transitionTo(next: ChunkStatus): this {
    JobChunk.assertStatusTransition(this.state.status, next);
    this.state.status = next;
    return this;
  }

  public markRunning(startedAt = new Date().toISOString()): this {
    this.transitionTo("running");
    this.state.attempts += 1;
    this.state.startedAt = startedAt;
    this.state.finishedAt = null;
    this.state.errorSummary = null;
    return this;
  }

  public markSucceeded(markdownPath: string, finishedAt = new Date().toISOString()): this {
    if (markdownPath.trim().length === 0) {
      throw new Error(`markdownPath vazio para chunk ${this.index}`);
    }

    this.transitionTo("succeeded");
    this.state.markdownPath = markdownPath;
    this.state.finishedAt = finishedAt;
    this.state.errorSummary = null;
    return this;
  }

  public markFailed(errorSummary: string, finishedAt = new Date().toISOString()): this {
    this.transitionTo("failed");
    this.state.finishedAt = finishedAt;
    this.state.errorSummary = errorSummary;
    return this;
  }

  public returnToPending(): this {
    this.transitionTo("pending");
    this.state.startedAt = null;
    this.state.finishedAt = null;
    return this;
  }

  public toState(): ChunkState {
    return cloneChunkState(this.state);
  }
}
