import { pathToFileURL } from "node:url";

import { WikiCliApplication, type WikiCliDependencies } from "./wiki-cli-application.js";

export async function runWikiCli(argv: string[], dependencies: WikiCliDependencies = {}): Promise<number> {
  return await new WikiCliApplication(dependencies).run(argv);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  process.exitCode = await runWikiCli(argv);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
