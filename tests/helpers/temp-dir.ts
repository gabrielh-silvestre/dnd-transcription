import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirectories = new Set<string>();

export async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `${prefix}-`));
  tempDirectories.add(directory);

  return directory;
}

export async function cleanupTempDirs(): Promise<void> {
  const directories = Array.from(tempDirectories);
  tempDirectories.clear();

  await Promise.all(
    directories.map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
}
