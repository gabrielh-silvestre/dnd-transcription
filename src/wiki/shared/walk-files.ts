import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface WalkFilesOptions {
  filter?: (absolutePath: string) => boolean;
  map: (absolutePath: string) => string;
}

export async function walkFiles(dir: string, options: WalkFilesOptions): Promise<string[]> {
  const include = options.filter ?? (() => true);

  async function collect(currentDir: string): Promise<string[]> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        results.push(...(await collect(absolutePath)));
        continue;
      }

      if (entry.isFile() && include(absolutePath)) {
        results.push(options.map(absolutePath));
      }
    }

    return results;
  }

  try {
    return (await collect(dir)).sort();
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;

    if (code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
