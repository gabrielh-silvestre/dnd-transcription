<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 -->

# mcp

## Purpose
The MCP (Model Context Protocol) stdio gateway — a sibling of the CLI gateway over the shared, framework-agnostic core (`src/core/`). It exposes transcription to an LLM client as a `transcribe` tool plus a zero-arg `transcription_health` tool. Per-call knobs are tool params (R2); infra/secrets (provider, model, API keys, backend, endpoint, language, prompt) are startup-validated env (R3) and NEVER appear in any tool input schema. stdout carries ONLY JSON-RPC framing; all logging is diverted off stdout.

## Key Files
| File | Description |
|------|-------------|
| `main.ts` | Node entrypoint; `startMcpServer()` resolves infra (R3 fail-fast, exits non-zero BEFORE connect on invalid env), builds the server, connects `StdioServerTransport`. ESM-main detection via `pathToFileURL`. |
| `server.ts` | Builds `McpServer`, registers `transcribe` + `transcription_health`. The `transcribe` handler runs the `MCP_ALLOWED_ROOT` containment check (`assertPathsWithinRoot`) and the MCP output-dir guard, builds the per-call binding thunk fresh, injects a stderr+buffer logger, and calls `runTranscriptionCore` in try/catch. |
| `resolve-infra.ts` | R3 startup dispatch: reads `MCP_TRANSCRIPTION_PROVIDER` from env, dispatches to `createOpenAIWhisperConfig` / `createOpenAITranscriptionConfig` / `resolveFakeTranscriberOptions`, lets `ValidationError` abort the process (unknown providers rejected via the core's `unsupportedProviderMessage`). Also resolves the optional `MCP_ALLOWED_ROOT` into `allowedRoot`. Holds the env-derived `provider` + binding factory; `createPerCallBindingThunk` builds the per-call thunk. |
| `assert-paths-within-root.ts` | `MCP_ALLOWED_ROOT` containment (opt-in). `null` root = no-op (CLI-equivalent reach). When set, every `input`/`outputDir` must resolve at/under the root; `..` escapes and outside absolutes throw `ValidationError`. |
| `tool-schemas.ts` | Zod raw shapes for the tool inputs. `transcribeToolInputShape` = R2 surface (`inputs`, `outputDir`, `chunkDurationSeconds`, `concurrency`, `fileConcurrency` default 1, `cleanupPolicy`, `resume`). `provider`/model/`apiKey`/backend/endpoint/language/prompt are DELIBERATELY ABSENT (R3). |
| `map-params-to-options.ts` | Maps validated tool params -> core `TranscriptionRequest` + derived `chunkDurationMs` (inlined `seconds * 1000` to avoid importing `cli-argument-parser`). |
| `map-result-to-output.ts` | Maps the structured core result -> `CallToolResult` (`structuredContent` = `{ exitCode, fileResults }`; `isError` on exitCode 1\|2). Replicates per-file partial-failure detail in `content` (the CLI's `logBatchSummary` stays CLI-only). |
| `health.ts` | `transcription_health` result: `{ provider, model, backend, ffmpegAvailable, ffprobeAvailable, serverVersion }`. Probes ffmpeg/ffprobe via `runCommand -version` with a 5s `timeoutMs` watchdog. Stateless by design (re-probes each call); NEVER returns secrets. |
| `stderr-logger.ts` | `Logger` that writes to stderr + an in-memory buffer, never stdout. `createChildLogger` (multi-input runs) inherits this base, so child loggers are stdout-safe. |

## For AI Agents

### Working In This Directory
- **HARD RULE (R4)**: `src/mcp/**` MUST NOT import `src/cli/transcription-cli-application`, `cli-argument-parser`, or `runCli`, and MUST NOT `spawn`/`exec` the CLI. Depend only on `src/core/**` (plus `application`/`infrastructure`/`domain`/`shared`). The only CLI leaf that may be reused is `input-path-resolver`.
- **stdout is sacred**: nothing but JSON-RPC may touch stdout. Use `createStderrBufferLogger`; never `console.log` or the default `createLogger` (which writes INFO/WARN to stdout).
- **provider is env-only**: derived from `MCP_TRANSCRIPTION_PROVIDER` at startup and injected into every core call. Do NOT add it (or model/key/backend/endpoint/language/prompt) to any tool schema.
- **provider set is single-sourced**: the supported providers + the unknown-provider message live in `src/core/supported-providers.ts`. A new provider goes there AND into the concrete dispatch of BOTH `DefaultTranscriberBindingFactory` and `resolveInfra`; the parity test guards drift.
- **path containment is opt-in**: when `MCP_ALLOWED_ROOT` is set, `assertPathsWithinRoot` must run BEFORE any filesystem access in `handleTranscribe`. Default (unset) keeps CLI-equivalent reach — do not change that default silently.
- **Per-call binding thunk**: build it FRESH on every `tools/call` so `assertOpenAIAudioChunkFitsUploadLimit` fires per call with the request's `chunkDurationMs`. Never build the binding once at startup.
- **Error boundary**: the core does NOT swallow — the handler's try/catch converts any throw into `isError` (chunk-size assertion, bad outputDir, etc.) without crashing the server. `fake` provider is exempt from startup fail-fast by design.
- Validation/diagnostic messages are in Portuguese — keep them.

## Dependencies

### Internal
`src/core/*` (`runTranscriptionCore`, `DefaultTranscriberBindingFactory`, `supported-providers`), `src/infrastructure/providers/*` (config factories), `src/shared/*` (logger types, errors, process/`runCommand`, app-version).

### External
`@modelcontextprotocol/sdk` (`server/mcp.js`, `server/stdio.js`, `types.js`), `zod`; node `fs/promises` (`stat`), `path`, `process`, `url` (`pathToFileURL`); ffmpeg/ffprobe spawned via `runCommand` for the health probe.
