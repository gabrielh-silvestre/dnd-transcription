import { type Transcriber } from "./transcriber.js";

export interface TranscriberBinding {
  readonly signature: string;
  createTranscriber(): Promise<Transcriber> | Transcriber;
}

export function bindTranscriber(transcriber: Transcriber): TranscriberBinding {
  return {
    signature: transcriber.signature,
    createTranscriber: () => transcriber,
  };
}
