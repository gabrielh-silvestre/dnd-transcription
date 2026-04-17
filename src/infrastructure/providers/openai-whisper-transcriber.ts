import { type OpenAIAudioClient } from "./openai-audio-client.js";
import { OpenAIAudioTranscriber, type OpenAIAudioTranscriberOptions } from "./openai-audio-transcriber.js";
import { type OpenAIWhisperConfig } from "./openai-whisper-config.js";

export type OpenAIWhisperTranscriberOptions = OpenAIAudioTranscriberOptions;

export class OpenAIWhisperTranscriber extends OpenAIAudioTranscriber {
  public constructor(
    config: Pick<OpenAIWhisperConfig, "provider" | "language" | "prompt" | "transcriberSignature">,
    client: OpenAIAudioClient,
    options: OpenAIWhisperTranscriberOptions = {},
  ) {
    super(config, client, options);
  }
}
