import { allChunksSucceeded } from "../domain/entities/job-state.js";
import { type JobStore } from "../domain/ports/job-store.js";
import { type Logger } from "../shared/logger.js";

export interface MergeTranscriptsInput {
  jobStore: JobStore;
  logger: Logger;
}

export interface MergeTranscriptsResult {
  finalMarkdownPath: string;
}

export async function mergeTranscripts(input: MergeTranscriptsInput): Promise<MergeTranscriptsResult> {
  const manifest = await input.jobStore.readManifest();
  const state = await input.jobStore.readJobState();

  if (!allChunksSucceeded(state)) {
    throw new Error("Merge final requer 100% dos chunks em succeeded.");
  }

  const sections: string[] = [];

  for (const manifestChunk of manifest.chunks) {
    const chunkState = state.chunks.find((candidate) => candidate.index === manifestChunk.index);

    if (chunkState?.markdownPath === null || chunkState?.markdownPath === undefined) {
      throw new Error(`Chunk ${manifestChunk.index} nao possui markdown persistido.`);
    }

    sections.push(await input.jobStore.readMarkdown(chunkState.markdownPath));
  }

  input.logger.info("merge", "Consolidando markdown final.", { chunkCount: sections.length });

  const finalMarkdownPath = await input.jobStore.writeFinalMarkdown(`${sections.join("\n\n")}\n`);

  return { finalMarkdownPath };
}
