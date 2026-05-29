import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { type BatchIndexEntry, type BatchIndexWriter } from "../../application/run-batch-transcription-use-case.js";

export class FileBatchIndexWriter implements BatchIndexWriter {
  public async write(outputDir: string, entries: BatchIndexEntry[]): Promise<void> {
    const target = join(resolve(outputDir), "batch-index.json");
    await writeFile(target, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8");
  }
}
