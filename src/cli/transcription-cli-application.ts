import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import { type CliOptions, type CliParseResult, CliArgumentParser } from "./cli-argument-parser.js";
import {
  DefaultTranscriberBindingFactory,
  type DefaultTranscriberBindingFactoryDependencies,
  type TranscriberBindingFactory,
} from "./default-transcriber-binding-factory.js";
import { InputPathResolver } from "./input-path-resolver.js";
import {
  RunBatchTranscriptionUseCase,
  type BatchFileResult,
  type BatchIndexWriter,
} from "../application/run-batch-transcription-use-case.js";
import {
  RunTranscriptionJobUseCase,
  type RunTranscriptionJobUseCaseInput,
  type RunTranscriptionJobUseCaseResult,
} from "../application/run-transcription-job-use-case.js";
import { type JobStore } from "../domain/ports/job-store.js";
import { type MediaSegmenter } from "../domain/ports/media-segmenter.js";
import { bindTranscriber, type TranscriberBinding } from "../domain/ports/transcriber-binding.js";
import { type Transcriber } from "../domain/ports/transcriber.js";
import { FFmpegMediaSegmenter } from "../infrastructure/media/ffmpeg-media-segmenter.js";
import { FileBatchIndexWriter } from "../infrastructure/storage/file-batch-index-writer.js";
import { FileJobStore } from "../infrastructure/storage/file-job-store.js";
import { loadEnvFile } from "../shared/env-file.js";
import { ValidationError } from "../shared/errors.js";
import { createLogger, type Logger } from "../shared/logger.js";
import { resolveJobPaths } from "../shared/paths.js";

export interface CliDependencies extends DefaultTranscriberBindingFactoryDependencies {
  createLogger?: () => Logger;
  createJobStore?: (outputDir: string, resolvedInputPath?: string) => JobStore;
  createMediaSegmenter?: (resolvedInputPath: string) => MediaSegmenter;
  createTranscriberBinding?: (resolvedInputPath: string, options: CliOptions) => TranscriberBinding;
  createTranscriber?: (resolvedInputPath: string, options: CliOptions) => Transcriber;
  cwd?: string;
}

export interface CliArgumentParserLike {
  parse(argv: string[]): CliParseResult;
}

export interface InputPathResolverLike {
  resolve(inputPath: string): string;
}

export interface RunTranscriptionJobExecutor {
  execute(input: RunTranscriptionJobUseCaseInput): Promise<RunTranscriptionJobUseCaseResult>;
}

export interface TranscriptionCliApplicationServices {
  argumentParser?: CliArgumentParserLike;
  inputPathResolver?: InputPathResolverLike;
  createDefaultTranscriberBindingFactory?: (
    dependencies: DefaultTranscriberBindingFactoryDependencies,
  ) => TranscriberBindingFactory;
  loadEnvFile?: typeof loadEnvFile;
  runTranscriptionJobUseCase?: RunTranscriptionJobExecutor;
  batchIndexWriter?: BatchIndexWriter;
  writeStdout?: (text: string) => void;
}

export class TranscriptionCliApplication {
  private readonly argumentParser: CliArgumentParserLike;
  private readonly inputPathResolver: InputPathResolverLike;
  private readonly createDefaultTranscriberBindingFactory: (
    dependencies: DefaultTranscriberBindingFactoryDependencies,
  ) => TranscriberBindingFactory;
  private readonly loadEnvFileFn: typeof loadEnvFile;
  private readonly runTranscriptionJobUseCase: RunTranscriptionJobExecutor;
  private readonly batchIndexWriter: BatchIndexWriter;
  private readonly writeStdout: (text: string) => void;

  public constructor(
    private readonly dependencies: CliDependencies = {},
    services: TranscriptionCliApplicationServices = {},
  ) {
    this.argumentParser = services.argumentParser ?? new CliArgumentParser();
    this.inputPathResolver = services.inputPathResolver ?? new InputPathResolver();
    this.createDefaultTranscriberBindingFactory = services.createDefaultTranscriberBindingFactory
      ?? ((factoryDependencies) => new DefaultTranscriberBindingFactory(factoryDependencies));
    this.loadEnvFileFn = services.loadEnvFile ?? loadEnvFile;
    this.runTranscriptionJobUseCase = services.runTranscriptionJobUseCase ?? new RunTranscriptionJobUseCase();
    this.batchIndexWriter = services.batchIndexWriter ?? new FileBatchIndexWriter();
    this.writeStdout = services.writeStdout ?? ((text) => {
      process.stdout.write(text);
    });
  }

  public async run(argv: string[]): Promise<number> {
    const logger = this.dependencies.createLogger?.() ?? createLogger();

    try {
      const parsed = this.argumentParser.parse(argv);

      if (parsed.kind === "help" || parsed.kind === "version") {
        this.writeStdout(parsed.text);
        return 0;
      }

      const normalizedOptions = this.normalizeOptions(parsed.options);
      await this.assertOutputDirIsDirectory(normalizedOptions.outputDir);
      const env = await this.loadEnvFileFn({
        env: this.dependencies.env,
        cwd: this.dependencies.cwd,
      });

      const createJobStore = (...args: [outputDir: string, resolvedInputPath?: string]) =>
        this.dependencies.createJobStore?.(...args)
          ?? new FileJobStore(resolveJobPaths(args[0]));
      const createMediaSegmenter = (resolvedInputPath: string) =>
        this.dependencies.createMediaSegmenter?.(resolvedInputPath)
          ?? new FFmpegMediaSegmenter();
      const createTranscriberBinding = (resolvedInputPath: string) =>
        this.resolveTranscriberBinding(resolvedInputPath, normalizedOptions, env);

      const batch = new RunBatchTranscriptionUseCase({
        executor: this.runTranscriptionJobUseCase,
        batchIndexWriter: this.batchIndexWriter,
      });
      const result = await batch.execute({
        inputPaths: normalizedOptions.inputPaths,
        outputDir: normalizedOptions.outputDir,
        chunkDurationSeconds: normalizedOptions.chunkDurationSeconds,
        chunkDurationMs: normalizedOptions.chunkDurationMs,
        concurrency: normalizedOptions.concurrency,
        fileConcurrency: normalizedOptions.fileConcurrency,
        provider: normalizedOptions.provider,
        cleanupPolicy: normalizedOptions.cleanupPolicy,
        resume: normalizedOptions.resume,
        createJobStore,
        createMediaSegmenter,
        createTranscriberBinding,
        logger,
      });

      this.logBatchSummary(logger, result.fileResults);
      return result.exitCode;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("cli", message);
      return 1;
    }
  }

  private normalizeOptions(options: CliOptions): CliOptions {
    return {
      ...options,
      inputPaths: options.inputPaths.map((path) => resolve(this.inputPathResolver.resolve(path))),
    };
  }

  private async assertOutputDirIsDirectory(outputDir: string): Promise<void> {
    try {
      const stats = await stat(resolve(outputDir));

      if (!stats.isDirectory()) {
        throw new ValidationError("--output deve ser um diretorio.");
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
    }
  }

  private resolveTranscriberBinding(
    resolvedInputPath: string,
    options: CliOptions,
    env: NodeJS.ProcessEnv,
  ): TranscriberBinding {
    if (this.dependencies.createTranscriberBinding !== undefined) {
      return this.dependencies.createTranscriberBinding(resolvedInputPath, options);
    }

    if (this.dependencies.createTranscriber !== undefined) {
      return bindTranscriber(this.dependencies.createTranscriber(resolvedInputPath, options));
    }

    return this.createDefaultTranscriberBindingFactory({
      createOpenAIAudioClient: this.dependencies.createOpenAIAudioClient,
      env,
    }).create(options);
  }

  private logBatchSummary(logger: Logger, fileResults: BatchFileResult[]): void {
    for (const fileResult of fileResults) {
      if (fileResult.exitCode === 0) {
        continue;
      }

      const metadata = {
        inputPath: fileResult.inputPath,
        exitCode: fileResult.exitCode,
        subdir: fileResult.subdir,
        errorSummary: fileResult.errorSummary,
      };

      if (fileResult.exitCode === 2) {
        logger.warn("batch", "Arquivo encerrou com falha parcial.", metadata);
      } else {
        logger.error("batch", "Arquivo encerrou com erro fatal.", metadata);
      }
    }

    const failures = fileResults.filter((fileResult) => fileResult.exitCode !== 0).length;
    logger.info("batch", "Batch concluido.", {
      total: fileResults.length,
      failures,
    });
  }
}
