import {
  RunTranscriptionJobUseCase,
  type RunTranscriptionJobUseCaseInput,
  type RunTranscriptionJobUseCaseResult,
} from "./run-transcription-job-use-case.js";
import { bindTranscriber, type TranscriberBinding } from "../domain/ports/transcriber-binding.js";
import { type Transcriber } from "../domain/ports/transcriber.js";

export interface RunTranscriptionJobInput extends Omit<RunTranscriptionJobUseCaseInput, "transcriberBinding"> {
  transcriber?: Transcriber;
  transcriberBinding?: TranscriberBinding;
}

export type RunTranscriptionJobResult = RunTranscriptionJobUseCaseResult;

function resolveTranscriberBinding(input: Pick<RunTranscriptionJobInput, "transcriber" | "transcriberBinding">): TranscriberBinding {
  if (input.transcriberBinding !== undefined) {
    return input.transcriberBinding;
  }

  if (input.transcriber !== undefined) {
    return bindTranscriber(input.transcriber);
  }

  throw new Error("RunTranscriptionJob requer `transcriber` ou `transcriberBinding`.");
}

export async function runTranscriptionJob(input: RunTranscriptionJobInput): Promise<RunTranscriptionJobResult> {
  const { transcriber: _legacyTranscriber, transcriberBinding: _providedBinding, ...useCaseInput } = input;

  return await new RunTranscriptionJobUseCase().execute({
    ...useCaseInput,
    transcriberBinding: resolveTranscriberBinding(input),
  });
}
