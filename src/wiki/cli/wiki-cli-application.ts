import { createLogger, type Logger } from "../../shared/logger.js";
import {
  CodeWikiService,
  type CodeWikiLintResult,
  type CodeWikiMutationResult,
  type CodeWikiQueryMatch,
} from "../application/code-wiki-service.js";
import { WikiArgumentParser, type WikiCliParseResult } from "./wiki-argument-parser.js";

export interface WikiCliDependencies {
  createLogger?: () => Logger;
  cwd?: string;
}

export interface WikiCliServices {
  argumentParser?: Pick<WikiArgumentParser, "parse">;
  codeWikiService?: Pick<CodeWikiService, "init" | "refresh" | "ingest" | "query" | "lint">;
  writeStdout?: (text: string) => void;
}

export class WikiCliApplication {
  private readonly argumentParser: Pick<WikiArgumentParser, "parse">;
  private readonly codeWikiService: Pick<CodeWikiService, "init" | "refresh" | "ingest" | "query" | "lint">;
  private readonly writeStdout: (text: string) => void;

  public constructor(
    private readonly dependencies: WikiCliDependencies = {},
    services: WikiCliServices = {},
  ) {
    this.argumentParser = services.argumentParser ?? new WikiArgumentParser();
    this.codeWikiService = services.codeWikiService ?? new CodeWikiService({
      cwd: this.dependencies.cwd,
    });
    this.writeStdout = services.writeStdout ?? ((text) => {
      process.stdout.write(text);
    });
  }

  public async run(argv: string[]): Promise<number> {
    const logger = this.dependencies.createLogger?.() ?? createLogger();

    try {
      const parsed = this.argumentParser.parse(argv);

      switch (parsed.kind) {
        case "help":
          this.writeStdout(parsed.text);
          return 0;
        case "init":
          this.writeStdout(this.renderMutationResult(await this.codeWikiService.init(parsed.wikiRoot), "init"));
          return 0;
        case "refresh":
          this.writeStdout(this.renderMutationResult(await this.codeWikiService.refresh(parsed.wikiRoot), "refresh"));
          return 0;
        case "ingest":
          this.writeStdout(this.renderMutationResult(
            await this.codeWikiService.ingest(parsed.sourcePaths, parsed.wikiRoot),
            "ingest",
          ));
          return 0;
        case "query":
          this.writeStdout(this.renderQueryResult(await this.codeWikiService.query(
            parsed.query,
            parsed.wikiRoot,
            parsed.limit,
          )));
          return 0;
        case "lint":
          this.writeStdout(this.renderLintResult(await this.codeWikiService.lint(parsed.wikiRoot)));
          return 0;
        // TODO OPT: the pre-refactor dispatch used `lint` as an unconditional catch-all.
        // This switch relies on `parsed.kind` being a closed discriminated union for
        // exhaustiveness (build-enforced). Optional: add an explicit `default` (exhaustive
        // never-check, or lint fallback) to remove the theoretical out-of-union divergence.
      }
    } catch (error) {
      logger.error("wiki", error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  private renderMutationResult(result: CodeWikiMutationResult, command: "init" | "refresh" | "ingest"): string {
    return [
      `wiki ${command} concluido`,
      `wiki root: ${result.wikiRoot}`,
      `updated pages: ${result.updatedPages.join(", ")}`,
      `log: ${result.logPath}`,
      "",
    ].join("\n");
  }

  private renderQueryResult(matches: readonly CodeWikiQueryMatch[]): string {
    if (matches.length === 0) {
      return "nenhuma pagina encontrada\n";
    }

    return [
      "query results:",
      ...matches.map((match, index) => {
        const lines = [
          `${index + 1}. ${match.title} (${match.path})`,
          `   summary: ${match.summary}`,
          `   score: ${match.score}`,
        ];

        if (match.snippet.length > 0) {
          lines.push(`   snippet: ${match.snippet}`);
        }

        return lines.join("\n");
      }),
      "",
    ].join("\n");
  }

  private renderLintResult(result: CodeWikiLintResult): string {
    return [
      "wiki lint concluido",
      `wiki root: ${result.wikiRoot}`,
      `report: ${result.reportPath}`,
      `missing required pages: ${result.missingRequiredPages.length}`,
      `unindexed pages: ${result.unindexedPages.length}`,
      `orphan pages: ${result.orphanPages.length}`,
      `broken links: ${result.brokenLinks.length}`,
      "",
    ].join("\n");
  }
}
