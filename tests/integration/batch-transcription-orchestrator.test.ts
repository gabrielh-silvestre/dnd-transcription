import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

import { runCli } from "../../src/cli/main.js";
import { type TranscriptionRequest, type TranscriptionResult } from "../../src/domain/entities/transcription-result.js";
import { createTranscriberSignature, type Transcriber } from "../../src/domain/ports/transcriber.js";
import { FileJobStore } from "../../src/infrastructure/storage/file-job-store.js";
import { type Logger } from "../../src/shared/logger.js";
import { deriveJobSubdir, resolveJobPaths } from "../../src/shared/paths.js";
import { createTempDir } from "../helpers/temp-dir.js";
import { StubMediaSegmenter } from "../helpers/stub-media-segmenter.js";

class ControlledTranscriber implements Transcriber {
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

interface CapturedLog {
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  metadata?: Record<string, unknown>;
}

function createCapturingLogger(): { logger: Logger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = [];
  const logger: Logger = {
    info(scope, message, metadata) {
      logs.push({ level: "info", scope, message, metadata });
    },
    warn(scope, message, metadata) {
      logs.push({ level: "warn", scope, message, metadata });
    },
    error(scope, message, metadata) {
      logs.push({ level: "error", scope, message, metadata });
    },
  };

  return { logger, logs };
}

function createSegmenter(): StubMediaSegmenter {
  return new StubMediaSegmenter({
    totalDurationMs: 180_000,
    chunks: [
      { index: 1, startMs: 0, endMs: 60_000 },
      { index: 2, startMs: 60_000, endMs: 120_000 },
      { index: 3, startMs: 120_000, endMs: 180_000 },
    ],
  });
}

async function createInputFixture(root: string, name: string): Promise<string> {
  const inputPath = join(root, name);
  await writeFile(inputPath, `fixture-${name}`, "utf8");
  return inputPath;
}

interface PersistedJobState {
  status: string;
  chunks: Array<{ index: number; status: string; attempts: number }>;
}

async function readJobStateForSubdir(outputDir: string, subdir: string): Promise<PersistedJobState> {
  return JSON.parse(await readFile(join(outputDir, subdir, "job-state.json"), "utf8")) as PersistedJobState;
}

interface BatchIndex {
  entries: Array<{ inputPath: string; subdir: string; exitCode: number; status: string }>;
}

async function readBatchIndex(outputDir: string): Promise<BatchIndex> {
  return JSON.parse(await readFile(join(outputDir, "batch-index.json"), "utf8")) as BatchIndex;
}

function buildArgs(options: {
  inputs: string[];
  outputDir: string;
  resume?: boolean;
}): string[] {
  const args: string[] = [];
  for (const input of options.inputs) {
    args.push("--input", input);
  }
  args.push(
    "--output",
    options.outputDir,
    "--chunk-duration-seconds",
    "60",
    "--concurrency",
    "2",
    "--file-concurrency",
    "2",
    "--provider",
    "fake",
    "--cleanup-policy",
    "keep",
  );
  if (options.resume === true) {
    args.push("--resume");
  }
  return args;
}

describe("Batch transcription orchestrator", () => {
  it("transcreve 3 arquivos com sucesso em subdirs isolados e grava batch-index.json", async () => {
    const root = await createTempDir("batch-success");
    const outputDir = await createTempDir("batch-success-out");
    const aAbs = await createInputFixture(root, "a.mkv");
    const bAbs = await createInputFixture(root, "b.mkv");
    const cAbs = await createInputFixture(root, "c.mkv");

    const failuresByPath: Record<string, Record<number, number>> = { [aAbs]: {}, [bAbs]: {}, [cAbs]: {} };

    const exitCode = await runCli(buildArgs({ inputs: [aAbs, bAbs, cAbs], outputDir }), {
      createMediaSegmenter: () => createSegmenter(),
      createTranscriber: (resolvedInputPath) => new ControlledTranscriber(failuresByPath[resolvedInputPath] ?? {}),
    });

    expect(exitCode).toBe(0);

    const subdirA = deriveJobSubdir(aAbs);
    const subdirB = deriveJobSubdir(bAbs);
    const subdirC = deriveJobSubdir(cAbs);

    await stat(join(outputDir, subdirA, "transcript.md"));
    await stat(join(outputDir, subdirB, "transcript.md"));
    await stat(join(outputDir, subdirC, "transcript.md"));

    // Each subdir owns its own job-state.json with no cross-corruption.
    const stateA = await readJobStateForSubdir(outputDir, subdirA);
    const stateB = await readJobStateForSubdir(outputDir, subdirB);
    const stateC = await readJobStateForSubdir(outputDir, subdirC);
    expect(stateA.status).toBe("succeeded");
    expect(stateB.status).toBe("succeeded");
    expect(stateC.status).toBe("succeeded");

    const index = await readBatchIndex(outputDir);
    expect(index.entries.length).toBe(3);
    expect(index.entries.map((entry) => entry.inputPath)).toStrictEqual([aAbs, bAbs, cAbs]);
    expect(index.entries[0]!.subdir).toBe(subdirA);
    expect(index.entries[1]!.subdir).toBe(subdirB);
    expect(index.entries[2]!.subdir).toBe(subdirC);
    expect(index.entries.map((entry) => entry.exitCode)).toStrictEqual([0, 0, 0]);
  });

  it("isola a falha parcial de um arquivo, retoma com --resume e adiciona um novo arquivo", async () => {
    const root = await createTempDir("batch-partial");
    const outputDir = await createTempDir("batch-partial-out");
    const aAbs = await createInputFixture(root, "a.mkv");
    const bAbs = await createInputFixture(root, "b.mkv");
    const cAbs = await createInputFixture(root, "c.mkv");
    const dAbs = await createInputFixture(root, "d.mkv");

    const subdirA = deriveJobSubdir(aAbs);
    const subdirB = deriveJobSubdir(bAbs);
    const subdirC = deriveJobSubdir(cAbs);
    const subdirD = deriveJobSubdir(dAbs);

    const signatureByPath: Record<string, string> = {
      [aAbs]: createTranscriberSignature({ provider: "fake", variant: "controlled", file: "a" }),
      [bAbs]: createTranscriberSignature({ provider: "fake", variant: "controlled", file: "b" }),
      [cAbs]: createTranscriberSignature({ provider: "fake", variant: "controlled", file: "c" }),
      [dAbs]: createTranscriberSignature({ provider: "fake", variant: "controlled", file: "d" }),
    };

    // First run: B fails chunk 2 once. No --resume.
    const firstFailures: Record<string, Record<number, number>> = {
      [aAbs]: {},
      [bAbs]: { 2: 1 },
      [cAbs]: {},
    };
    const first = createCapturingLogger();

    const firstExit = await runCli(buildArgs({ inputs: [aAbs, bAbs, cAbs], outputDir }), {
      createLogger: () => first.logger,
      createMediaSegmenter: () => createSegmenter(),
      createTranscriber: (resolvedInputPath) =>
        new ControlledTranscriber(firstFailures[resolvedInputPath] ?? {}, signatureByPath[resolvedInputPath]),
    });

    expect(firstExit).toBe(2);

    const stateBAfterFirst = await readJobStateForSubdir(outputDir, subdirB);
    expect(stateBAfterFirst.status).toBe("partial_failed");
    expect((await readJobStateForSubdir(outputDir, subdirA)).status).toBe("succeeded");
    expect((await readJobStateForSubdir(outputDir, subdirC)).status).toBe("succeeded");

    // Summary: a warn in scope "batch" naming B's inputPath + subdir.
    const warnForB = first.logs.find(
      (log) => log.level === "warn" && log.scope === "batch" && log.metadata?.inputPath === bAbs,
    );
    expect(warnForB).toBeDefined();
    expect(warnForB!.metadata?.subdir).toBe(subdirB);
    expect(warnForB!.metadata?.exitCode).toBe(2);

    // Second run: --resume, B's failures cleared, new file D appended (no prior artifacts).
    const secondFailures: Record<string, Record<number, number>> = {
      [aAbs]: {},
      [bAbs]: {},
      [cAbs]: {},
      [dAbs]: {},
    };

    const secondExit = await runCli(buildArgs({ inputs: [aAbs, bAbs, cAbs, dAbs], outputDir, resume: true }), {
      createMediaSegmenter: () => createSegmenter(),
      createTranscriber: (resolvedInputPath) =>
        new ControlledTranscriber(secondFailures[resolvedInputPath] ?? {}, signatureByPath[resolvedInputPath]),
    });

    expect(secondExit).toBe(0);

    const stateBAfterResume = await readJobStateForSubdir(outputDir, subdirB);
    expect(stateBAfterResume.status).toBe("succeeded");
    expect(stateBAfterResume.chunks.find((chunk) => chunk.index === 2)?.attempts).toBe(2);

    const stateDAfterResume = await readJobStateForSubdir(outputDir, subdirD);
    expect(stateDAfterResume.status).toBe("succeeded");

    expect((await readJobStateForSubdir(outputDir, subdirA)).status).toBe("succeeded");
    expect((await readJobStateForSubdir(outputDir, subdirC)).status).toBe("succeeded");

    await stat(join(outputDir, subdirD, "transcript.md"));
  });

  it("snapshot incompativel no resume falha apenas o arquivo afetado; irmaos intactos", async () => {
    const root = await createTempDir("batch-incompat");
    const outputDir = await createTempDir("batch-incompat-out");
    const aAbs = await createInputFixture(root, "a.mkv");
    const bAbs = await createInputFixture(root, "b.mkv");
    const cAbs = await createInputFixture(root, "c.mkv");

    const subdirA = deriveJobSubdir(aAbs);
    const subdirB = deriveJobSubdir(bAbs);
    const subdirC = deriveJobSubdir(cAbs);

    const originalSignatures: Record<string, string> = {
      [aAbs]: createTranscriberSignature({ provider: "fake", variant: "controlled", file: "a" }),
      [bAbs]: createTranscriberSignature({ provider: "fake", variant: "controlled", file: "b" }),
      [cAbs]: createTranscriberSignature({ provider: "fake", variant: "controlled", file: "c" }),
    };

    const firstExit = await runCli(buildArgs({ inputs: [aAbs, bAbs, cAbs], outputDir }), {
      createMediaSegmenter: () => createSegmenter(),
      createTranscriber: (resolvedInputPath) =>
        new ControlledTranscriber({}, originalSignatures[resolvedInputPath]),
    });

    expect(firstExit).toBe(0);

    await stat(join(outputDir, subdirA, "transcript.md"));
    await stat(join(outputDir, subdirC, "transcript.md"));

    // Second run with --resume: B gets a different signature -> incompatible -> B exits 1.
    const resumeSignatures: Record<string, string> = {
      ...originalSignatures,
      [bAbs]: createTranscriberSignature({
        provider: "fake",
        variant: "controlled",
        file: "b",
        prompt: "contexto-alterado",
      }),
    };

    const secondExit = await runCli(buildArgs({ inputs: [aAbs, bAbs, cAbs], outputDir, resume: true }), {
      createMediaSegmenter: () => createSegmenter(),
      createTranscriber: (resolvedInputPath) =>
        new ControlledTranscriber({}, resumeSignatures[resolvedInputPath]),
    });

    expect(secondExit).toBe(1);

    // Siblings unaffected: A and C still succeeded with intact transcripts.
    expect((await readJobStateForSubdir(outputDir, subdirA)).status).toBe("succeeded");
    expect((await readJobStateForSubdir(outputDir, subdirC)).status).toBe("succeeded");
    await stat(join(outputDir, subdirA, "transcript.md"));
    await stat(join(outputDir, subdirC, "transcript.md"));
    expect(subdirB).not.toBe(subdirA);
  });

  it("C1: arquivo unico chama createJobStore com o outputDir puro (sem arg de path derivado) e mantem layout flat", async () => {
    const root = await createTempDir("batch-c1");
    const outputDir = await createTempDir("batch-c1-out");
    const aAbs = await createInputFixture(root, "a.mkv");

    const calls: Array<{ args: unknown[] }> = [];
    const createJobStore = (...args: [string, string?]) => {
      calls.push({ args });
      return new FileJobStore(resolveJobPaths(args[0]));
    };

    const exitCode = await runCli(buildArgs({ inputs: [aAbs], outputDir }), {
      createJobStore,
      createMediaSegmenter: () => createSegmenter(),
      createTranscriber: () => new ControlledTranscriber({}),
    });

    expect(exitCode).toBe(0);
    expect(calls.length).toBe(1);
    // Arg-1 must be the bare outputDir (not a derived subdir) — this is the byte-for-byte routing guarantee.
    expect(calls[0]!.args[0]).toBe(outputDir);
    // No appended resolved-path arg for N=1 (Acceptance #2): the seam must observe exactly one argument.
    expect(calls[0]!.args.length).toBe(1);

    // Flat layout: transcript.md at the bare outputDir, no derived subdir created.
    await stat(join(outputDir, "transcript.md"));
  });
});
