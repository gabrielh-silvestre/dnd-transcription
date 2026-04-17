import { pathToFileURL } from "node:url";
import { basename, isAbsolute, join } from "node:path";

import { CLI_DEFAULT_RAW_INPUT_DIR, parseArgs, type CliOptions } from "./parse-args.js";
import { runTranscriptionJob } from "../application/run-transcription-job.js";
import { FFmpegMediaSegmenter } from "../infrastructure/media/ffmpeg-media-segmenter.js";
import {
  createFakeTranscriberSignature,
  FakeTranscriber,
  resolveFakeTranscriberOptions,
} from "../infrastructure/providers/fake-transcriber.js";
import { DefaultOpenAIAudioClient, type OpenAIAudioClient } from "../infrastructure/providers/openai-audio-client.js";
import { assertOpenAIAudioChunkFitsUploadLimit } from "../infrastructure/providers/openai-audio-provider-shared.js";
import { OpenAIAudioTranscriber } from "../infrastructure/providers/openai-audio-transcriber.js";
import {
  createOpenAITranscriptionConfig,
  OPENAI_TRANSCRIPTION_PROVIDER,
  type OpenAITranscriptionConfig,
} from "../infrastructure/providers/openai-transcription-config.js";
import {
  createOpenAIWhisperConfig,
  OPENAI_WHISPER_PROVIDER,
  type OpenAIWhisperConfig,
} from "../infrastructure/providers/openai-whisper-config.js";
import { FileJobStore } from "../infrastructure/storage/file-job-store.js";
import { loadEnvFile } from "../shared/env-file.js";
import { createLogger, type Logger } from "../shared/logger.js";
import { resolveJobPaths } from "../shared/paths.js";

import { type JobStore } from "../domain/ports/job-store.js";
import { type MediaSegmenter } from "../domain/ports/media-segmenter.js";
import { bindTranscriber, type TranscriberBinding } from "../domain/ports/transcriber-binding.js";
import { type Transcriber } from "../domain/ports/transcriber.js";

export type OpenAIProviderConfig = OpenAIWhisperConfig | OpenAITranscriptionConfig;

export interface CliDependencies {
  createLogger?: () => Logger;
  createJobStore?: (outputDir: string) => JobStore;
  createMediaSegmenter?: () => MediaSegmenter;
  createTranscriberBinding?: (options: CliOptions) => TranscriberBinding;
  createTranscriber?: (options: CliOptions) => Transcriber;
  createOpenAIAudioClient?: (config: OpenAIProviderConfig) => OpenAIAudioClient;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export function resolveCliInputPath(inputPath: string): string {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }

  if (basename(inputPath) !== inputPath) {
    return inputPath;
  }

  return join(CLI_DEFAULT_RAW_INPUT_DIR, inputPath);
}

function createConfiguredOpenAITranscriber(
  config: OpenAIProviderConfig,
  dependencies: Pick<CliDependencies, "createOpenAIAudioClient"> = {},
): Transcriber {
  const client = dependencies.createOpenAIAudioClient?.(config)
    ?? new DefaultOpenAIAudioClient(config);

  return new OpenAIAudioTranscriber(config, client);
}

function createConfiguredOpenAITranscriberBinding(
  config: OpenAIProviderConfig,
  options: CliOptions,
  dependencies: Pick<CliDependencies, "createOpenAIAudioClient"> = {},
): TranscriberBinding {
  assertOpenAIAudioChunkFitsUploadLimit({
    chunkDurationMs: options.chunkDurationMs,
    uploadLimitBytes: config.uploadLimitBytes,
    provider: config.provider,
  });

  return {
    signature: config.transcriberSignature,
    createTranscriber: () => createConfiguredOpenAITranscriber(config, dependencies),
  };
}

function createFakeTranscriberBinding(env: NodeJS.ProcessEnv): TranscriberBinding {
  const options = resolveFakeTranscriberOptions(env);

  return {
    signature: createFakeTranscriberSignature(options),
    createTranscriber: () => new FakeTranscriber(options),
  };
}

export function createDefaultTranscriberBinding(
  options: CliOptions,
  dependencies: Pick<CliDependencies, "createOpenAIAudioClient" | "env"> = {},
): TranscriberBinding {
  const env = dependencies.env ?? process.env;

  if (options.provider === "fake") {
    return createFakeTranscriberBinding(env);
  }

  if (options.provider === OPENAI_WHISPER_PROVIDER) {
    const config = createOpenAIWhisperConfig(env);
    return createConfiguredOpenAITranscriberBinding(config, options, dependencies);
  }

  if (options.provider === OPENAI_TRANSCRIPTION_PROVIDER) {
    const config = createOpenAITranscriptionConfig(env);
    return createConfiguredOpenAITranscriberBinding(config, options, dependencies);
  }

  throw new Error(`Provedor '${options.provider}' nao esta implementado nesta V1.`);
}

function materializeLegacyTranscriber(binding: TranscriberBinding): Transcriber {
  const transcriber = binding.createTranscriber();

  if (transcriber instanceof Promise) {
    throw new Error("createDefaultTranscriber nao suporta factories assicronas.");
  }

  return transcriber;
}

export function createDefaultTranscriber(
  options: CliOptions,
  dependencies: Pick<CliDependencies, "createOpenAIAudioClient" | "env"> = {},
): Transcriber {
  return materializeLegacyTranscriber(createDefaultTranscriberBinding(options, dependencies));
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
    const normalizedOptions: CliOptions = {
      ...options,
      inputPath: resolveCliInputPath(options.inputPath),
    };
    const env = await loadEnvFile({
      env: dependencies.env,
      cwd: dependencies.cwd,
    });
    const jobStore = dependencies.createJobStore?.(normalizedOptions.outputDir)
      ?? new FileJobStore(resolveJobPaths(normalizedOptions.outputDir));
    const mediaSegmenter = dependencies.createMediaSegmenter?.()
      ?? new FFmpegMediaSegmenter();
    const transcriberBinding = dependencies.createTranscriberBinding?.(normalizedOptions)
      ?? (dependencies.createTranscriber !== undefined
        ? bindTranscriber(dependencies.createTranscriber(normalizedOptions))
        : createDefaultTranscriberBinding(normalizedOptions, { ...dependencies, env }));
    const result = await runTranscriptionJob({
      ...normalizedOptions,
      jobStore,
      mediaSegmenter,
      transcriberBinding,
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
