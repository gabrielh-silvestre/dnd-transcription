import { z } from "zod";

/**
 * R2 per-call tool input surface for the `transcribe` tool, expressed as a Zod
 * raw shape (the form `McpServer.registerTool` consumes for `inputSchema`).
 *
 * DELIBERATELY ABSENT (R3 — infra/secrets, startup-env only, NEVER a tool param):
 * `provider`, model, `apiKey`, `backend`, `endpoint`, `language`, `prompt`.
 * These are validated at server startup via `createXConfig(env)` and injected
 * into every core call — exposing them here would let a caller override server
 * infra/secrets per request, which the architecture forbids.
 */
export const transcribeToolInputShape = {
  inputs: z
    .array(z.string().min(1))
    .min(1)
    .describe("Caminhos de arquivos de midia para transcrever (>=1)."),
  outputDir: z
    .string()
    .min(1)
    .describe("Diretorio de saida. 1 arquivo grava transcript.md flat; 2+ gravam subdiretorios + batch-index.json."),
  chunkDurationSeconds: z
    .number()
    .int()
    .positive()
    .describe("Duracao de cada chunk de audio em segundos (inteiro positivo)."),
  concurrency: z
    .number()
    .int()
    .positive()
    .describe("Chamadas simultaneas ao provider por arquivo (inteiro positivo)."),
  fileConcurrency: z
    .number()
    .int()
    .positive()
    .default(1)
    .describe("Quantos arquivos processar em paralelo (padrao 1)."),
  cleanupPolicy: z
    .enum(["on-success", "keep"])
    .describe("on-success remove artefatos intermediarios apos sucesso; keep mantem tudo."),
  resume: z
    .boolean()
    .optional()
    .default(false)
    .describe("Retoma um job anterior compativel no mesmo outputDir."),
} as const;

/** Parsed/validated shape of {@link transcribeToolInputShape}. */
export type TranscribeToolInput = z.infer<z.ZodObject<typeof transcribeToolInputShape>>;

/**
 * `transcription_health` is zero-arg. Use an empty raw shape so the published
 * schema is an empty object rather than `undefined`.
 */
export const healthToolInputShape = {} as const;
