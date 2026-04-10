import { pathToFileURL } from "node:url";

import { parseArgs } from "./parse-args.js";
import { runTranscriptionJob } from "../application/run-transcription-job.js";
import { FFmpegMediaSegmenter } from "../infrastructure/media/ffmpeg-media-segmenter.js";
import { FakeTranscriber } from "../infrastructure/providers/fake-transcriber.js";
import { FileJobStore } from "../infrastructure/storage/file-job-store.js";
import { createLogger, type Logger } from "../shared/logger.js";
import { resolveJobPaths } from "../shared/paths.js";

import { type JobStore } from "../domain/ports/job-store.js";
import { type MediaSegmenter } from "../domain/ports/media-segmenter.js";
import { type Transcriber } from "../domain/ports/transcriber.js";

export interface CliDependencies {
  createLogger?: () => Logger;
  createJobStore?: (outputDir: string) => JobStore;
  createMediaSegmenter?: () => MediaSegmenter;
  createTranscriber?: (provider: string) => Transcriber;
}

function createDefaultTranscriber(provider: string): Transcriber {
  if (provider === "fake") {
    return FakeTranscriber.fromEnvironment();
  }

  throw new Error(`Provedor '${provider}' nao esta implementado nesta V1.`);
}

export async function runCli(argv: string[], dependencies: CliDependencies = {}): Promise<number> {
  const logger = dependencies.createLogger?.() ?? createLogger();

  try {
    const parsed = parseArgs(argv);

    if (parsed.kind === "help") {
      process.stdout.write(parsed.text);
      return 0;
    }

    const { options } = parsed;
    const jobStore = dependencies.createJobStore?.(options.outputDir)
      ?? new FileJobStore(resolveJobPaths(options.outputDir));
    const mediaSegmenter = dependencies.createMediaSegmenter?.()
      ?? new FFmpegMediaSegmenter();
    const transcriber = dependencies.createTranscriber?.(options.provider)
      ?? createDefaultTranscriber(options.provider);
    const result = await runTranscriptionJob({
      ...options,
      jobStore,
      mediaSegmenter,
      transcriber,
      logger,
    });

    if (result.exitCode === 0) {
      logger.info("job", "Pipeline concluido com sucesso.", {
        finalMarkdownPath: result.finalMarkdownPath,
      });
    } else if (result.exitCode === 2) {
      logger.warn("job", "Pipeline encerrou com falha parcial.", {
        failedChunks: result.failedChunks,
      });
    } else {
      logger.error("job", result.errorSummary ?? "Pipeline encerrou com erro fatal.");
    }

    return result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("cli", message);
    return 1;
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  process.exitCode = await runCli(argv);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
