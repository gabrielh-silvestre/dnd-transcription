import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { runTranscriptionCore } from "../core/transcription-core.js";
import { resolveAppVersion } from "../shared/app-version.js";
import { ValidationError } from "../shared/errors.js";
import { resolveTranscriptionHealth } from "./health.js";
import { mapErrorToToolOutput, mapResultToToolOutput } from "./map-result-to-output.js";
import { mapParamsToRequest } from "./map-params-to-options.js";
import { createPerCallBindingThunk, type ResolvedInfra } from "./resolve-infra.js";
import { createStderrBufferLogger } from "./stderr-logger.js";
import {
  healthToolInputShape,
  transcribeToolInputShape,
  type TranscribeToolInput,
} from "./tool-schemas.js";

export const MCP_SERVER_NAME = "dnd-transcription";

export interface CreateTranscriptionMcpServerOptions {
  infra: ResolvedInfra;
  /** Override the env-derived process env (mainly for tests). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Builds the MCP stdio server with the `transcribe` and `transcription_health`
 * tools over the shared core. `infra` carries the startup-validated, env-derived
 * `provider` (R3) — the gateway injects it into every core call; it is NEVER a
 * tool param. The caller connects the returned server to a transport.
 */
export function createTranscriptionMcpServer(
  options: CreateTranscriptionMcpServerOptions,
): McpServer {
  const { infra } = options;

  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: resolveAppVersion(),
  });

  server.registerTool(
    "transcribe",
    {
      title: "Transcrever midia",
      description:
        "Fragmenta arquivos de midia longos, transcreve cada chunk via provider configurado e "
        + "mescla o markdown final. provider/model/credenciais sao configurados por ambiente no "
        + "servidor, nunca aqui.",
      inputSchema: transcribeToolInputShape,
    },
    async (params): Promise<CallToolResult> =>
      handleTranscribe(params as TranscribeToolInput, infra),
  );

  server.registerTool(
    "transcription_health",
    {
      title: "Saude da transcricao",
      description:
        "Confirma se o servidor esta configurado corretamente: provider/model/backend ativos e "
        + "disponibilidade de ffmpeg/ffprobe. Nunca retorna apiKey/endpoint.",
      inputSchema: healthToolInputShape,
    },
    async (): Promise<CallToolResult> => {
      const health = await resolveTranscriptionHealth(infra);

      return {
        content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
        structuredContent: health as unknown as Record<string, unknown>,
      };
    },
  );

  return server;
}

async function handleTranscribe(
  params: TranscribeToolInput,
  infra: ResolvedInfra,
): Promise<CallToolResult> {
  const { logger, drain } = createStderrBufferLogger();

  try {
    await assertOutputDirIsDirectory(params.outputDir);

    const { request, chunkDurationMs } = mapParamsToRequest(params);

    const result = await runTranscriptionCore({
      request,
      provider: infra.provider,
      chunkDurationMs,
      logger,
      // Build the binding thunk FRESH per call so the per-call chunk-size
      // assertion fires with this request's chunkDurationMs (see resolve-infra).
      createTranscriberBinding: createPerCallBindingThunk(infra, chunkDurationMs),
    });

    return mapResultToToolOutput(result, drain());
  } catch (error) {
    // The core does NOT swallow (ERROR-BOUNDARY SPLIT); the MCP gateway owns its
    // outer boundary and converts any throw into isError without crashing.
    return mapErrorToToolOutput(error, drain());
  }
}

/**
 * MCP variant of the output-dir guard. Unlike the CLI (which swallows a
 * non-existent dir), the MCP gateway SURFACES any failure — a bad/missing
 * outputDir becomes `isError` via the handler's catch.
 */
async function assertOutputDirIsDirectory(outputDir: string): Promise<void> {
  const stats = await stat(resolve(outputDir));

  if (!stats.isDirectory()) {
    throw new ValidationError("outputDir deve ser um diretorio.", "mcp");
  }
}
