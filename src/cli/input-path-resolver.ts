import { basename, isAbsolute, join } from "node:path";

export const CLI_DEFAULT_RAW_INPUT_DIR = ".ignore/raw";

export class InputPathResolver {
  constructor(private readonly defaultRawInputDir = CLI_DEFAULT_RAW_INPUT_DIR) {}

  resolve(inputPath: string): string {
    if (isAbsolute(inputPath)) {
      return inputPath;
    }

    if (basename(inputPath) !== inputPath) {
      return inputPath;
    }

    return join(this.defaultRawInputDir, inputPath);
  }
}

const defaultInputPathResolver = new InputPathResolver();

export function resolveCliInputPath(inputPath: string): string {
  return defaultInputPathResolver.resolve(inputPath);
}
