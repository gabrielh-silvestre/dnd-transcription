import { type TranscriberBindingInput } from "./transcriber-binding-input.js";
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
import { type TranscriberBinding } from "../domain/ports/transcriber-binding.js";
import { type Transcriber } from "../domain/ports/transcriber.js";
import { FAKE_PROVIDER, unsupportedProviderMessage } from "./supported-providers.js";

export type OpenAIProviderConfig = OpenAIWhisperConfig | OpenAITranscriptionConfig;

export interface DefaultTranscriberBindingFactoryDependencies {
  createOpenAIAudioClient?: (config: OpenAIProviderConfig) => OpenAIAudioClient;
  env?: NodeJS.ProcessEnv;
}

export interface TranscriberBindingFactory {
  create(options: TranscriberBindingInput): TranscriberBinding;
}

export class DefaultTranscriberBindingFactory implements TranscriberBindingFactory {
  public constructor(private readonly dependencies: DefaultTranscriberBindingFactoryDependencies = {}) {}

  public create(options: TranscriberBindingInput): TranscriberBinding {
    const env = this.dependencies.env ?? process.env;

    if (options.provider === FAKE_PROVIDER) {
      return this.createFakeTranscriberBinding(env);
    }

    if (options.provider === OPENAI_WHISPER_PROVIDER) {
      const config = createOpenAIWhisperConfig(env);
      return this.createConfiguredOpenAITranscriberBinding(config, options);
    }

    if (options.provider === OPENAI_TRANSCRIPTION_PROVIDER) {
      const config = createOpenAITranscriptionConfig(env);
      return this.createConfiguredOpenAITranscriberBinding(config, options);
    }

    throw new Error(unsupportedProviderMessage(options.provider));
  }

  private createConfiguredOpenAITranscriber(config: OpenAIProviderConfig): Transcriber {
    const client = this.dependencies.createOpenAIAudioClient?.(config)
      ?? new DefaultOpenAIAudioClient(config);

    return new OpenAIAudioTranscriber(config, client);
  }

  private createConfiguredOpenAITranscriberBinding(
    config: OpenAIProviderConfig,
    options: TranscriberBindingInput,
  ): TranscriberBinding {
    assertOpenAIAudioChunkFitsUploadLimit({
      chunkDurationMs: options.chunkDurationMs,
      uploadLimitBytes: config.uploadLimitBytes,
      provider: config.provider,
    });

    return {
      signature: config.transcriberSignature,
      createTranscriber: () => this.createConfiguredOpenAITranscriber(config),
    };
  }

  private createFakeTranscriberBinding(env: NodeJS.ProcessEnv): TranscriberBinding {
    const options = resolveFakeTranscriberOptions(env);

    return {
      signature: createFakeTranscriberSignature(options),
      createTranscriber: () => new FakeTranscriber(options),
    };
  }
}
