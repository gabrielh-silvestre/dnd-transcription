import { pathToFileURL } from "node:url";

import { TranscriptionCliApplication, type CliDependencies } from "./transcription-cli-application.js";

export { resolveCliInputPath } from "./input-path-resolver.js";
export {
  createDefaultTranscriber,
  createDefaultTranscriberBinding,
  DefaultTranscriberBindingFactory,
  type DefaultTranscriberBindingFactoryDependencies,
  type OpenAIProviderConfig,
} from "./default-transcriber-binding-factory.js";
export type { CliOptions } from "./cli-argument-parser.js";
export type { CliDependencies } from "./transcription-cli-application.js";

export async function runCli(argv: string[], dependencies: CliDependencies = {}): Promise<number> {
  return await new TranscriptionCliApplication(dependencies).run(argv);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  process.exitCode = await runCli(argv);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
