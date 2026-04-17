import {
  MergeTranscriptsUseCase,
  type MergeTranscriptsUseCaseInput,
  type MergeTranscriptsUseCaseResult,
} from "./merge-transcripts-use-case.js";

export type MergeTranscriptsInput = MergeTranscriptsUseCaseInput;
export type MergeTranscriptsResult = MergeTranscriptsUseCaseResult;

export async function mergeTranscripts(input: MergeTranscriptsInput): Promise<MergeTranscriptsResult> {
  return await new MergeTranscriptsUseCase().execute(input);
}
