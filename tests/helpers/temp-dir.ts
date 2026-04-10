import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext } from "node:test";

export async function createTempDir(prefix: string, context?: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `${prefix}-`));

  context?.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  return directory;
}
