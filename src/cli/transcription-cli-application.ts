import { type CliOptions, type CliParseResult, CliArgumentParser } from "./cli-argument-parser.js";
import {
  DefaultTranscriberBindingFactory,
  type DefaultTranscriberBindingFactoryDependencies,
  type TranscriberBindingFactory,
} from "./default-transcriber-binding-factory.js";
import { InputPathResolver } from "./input-path-resolver.js";
import {
  runTranscriptionJob,
  type RunTranscriptionJobInput,
  type RunTranscriptionJobResult,
} from "../application/run-transcription-job.js";
import { type JobStore } from "../domain/ports/job-store.js";
import { type MediaSegmenter } from "../domain/ports/media-segmenter.js";
import { bindTranscriber, type TranscriberBinding } from "../domain/ports/transcriber-binding.js";
import { type Transcriber } from "../domain/ports/transcriber.js";
import { FFmpegMediaSegmenter } from "../infrastructure/media/ffmpeg-media-segmenter.js";
import { FileJobStore } from "../infrastructure/storage/file-job-store.js";
import { loadEnvFile } from "../shared/env-file.js";
import { createLogger, type Logger } from "../shared/logger.js";
import { resolveJobPaths } from "../shared/paths.js";

export interface CliDependencies extends DefaultTranscriberBindingFactoryDependencies {
  createLogger?: () => Logger;
  createJobStore?: (outputDir: string) => JobStore;
  createMediaSegmenter?: () => MediaSegmenter;
  createTranscriberBinding?: (options: CliOptions) => TranscriberBinding;
  createTranscriber?: (options: CliOptions) => Transcriber;
  cwd?: string;
}

export interface CliArgumentParserLike {
  parse(argv: string[]): CliParseResult;
}

export interface InputPathResolverLike {
  resolve(inputPath: string): string;
}

export interface TranscriptionCliApplicationServices {
  argumentParser?: CliArgumentParserLike;
  inputPathResolver?: InputPathResolverLike;
  createDefaultTranscriberBindingFactory?: (
    dependencies: DefaultTranscriberBindingFactoryDependencies,
  ) => TranscriberBindingFactory;
  loadEnvFile?: typeof loadEnvFile;
  runTranscriptionJob?: (input: RunTranscriptionJobInput) => Promise<RunTranscriptionJobResult>;
  writeStdout?: (text: string) => void;
}

export class TranscriptionCliApplication {
  private readonly argumentParser: CliArgumentParserLike;
  private readonly inputPathResolver: InputPathResolverLike;
  private readonly createDefaultTranscriberBindingFactory: (
    dependencies: DefaultTranscriberBindingFactoryDependencies,
  ) => TranscriberBindingFactory;
  private readonly loadEnvFileFn: typeof loadEnvFile;
  private readonly runTranscriptionJobFn: (input: RunTranscriptionJobInput) => Promise<RunTranscriptionJobResult>;
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
    this.runTranscriptionJobFn = services.runTranscriptionJob ?? runTranscriptionJob;
    this.writeStdout = services.writeStdout ?? ((text) => {
      process.stdout.write(text);
    });
  }

  public async run(argv: string[]): Promise<number> {
    const logger = this.dependencies.createLogger?.() ?? createLogger();

    try {
      const parsed = this.argumentParser.parse(argv);

      if (parsed.kind === "help") {
        this.writeStdout(parsed.text);
        return 0;
      }

      const normalizedOptions = this.normalizeOptions(parsed.options);
      const env = await this.loadEnvFileFn({
        env: this.dependencies.env,
        cwd: this.dependencies.cwd,
      });
      const jobStore = this.dependencies.createJobStore?.(normalizedOptions.outputDir)
        ?? new FileJobStore(resolveJobPaths(normalizedOptions.outputDir));
      const mediaSegmenter = this.dependencies.createMediaSegmenter?.()
        ?? new FFmpegMediaSegmenter();
      const transcriberBinding = this.resolveTranscriberBinding(normalizedOptions, env);
      const result = await this.runTranscriptionJobFn({
        ...normalizedOptions,
        jobStore,
        mediaSegmenter,
        transcriberBinding,
        logger,
      });

      this.logResult(logger, result);
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
      inputPath: this.inputPathResolver.resolve(options.inputPath),
    };
  }

  private resolveTranscriberBinding(options: CliOptions, env: NodeJS.ProcessEnv): TranscriberBinding {
    if (this.dependencies.createTranscriberBinding !== undefined) {
      return this.dependencies.createTranscriberBinding(options);
    }

    if (this.dependencies.createTranscriber !== undefined) {
      return bindTranscriber(this.dependencies.createTranscriber(options));
    }

    return this.createDefaultTranscriberBindingFactory({
      createOpenAIAudioClient: this.dependencies.createOpenAIAudioClient,
      env,
    }).create(options);
  }

  private logResult(logger: Logger, result: RunTranscriptionJobResult): void {
    if (result.exitCode === 0) {
      logger.info("job", "Pipeline concluido com sucesso.", {
        finalMarkdownPath: result.finalMarkdownPath,
      });
      return;
    }

    if (result.exitCode === 2) {
      logger.warn("job", "Pipeline encerrou com falha parcial.", {
        failedChunks: result.failedChunks,
      });
      return;
    }

    logger.error("job", result.errorSummary ?? "Pipeline encerrou com erro fatal.");
  }
}
