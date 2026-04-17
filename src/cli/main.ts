import { pathToFileURL } from "node:url";

import { TranscriptionCliApplication, type CliDependencies } from "./transcription-cli-application.js";

export async function runCli(argv: string[], dependencies: CliDependencies = {}): Promise<number> {
  return await new TranscriptionCliApplication(dependencies).run(argv);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  process.exitCode = await runCli(argv);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
