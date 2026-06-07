---
title: "Core + Gateways (CLI and MCP)"
summary: "Framework-agnostic transcription core (src/core) shared by two sibling gateways — the CLI and the MCP stdio server — including the MCP tool surface, the env-only infra boundary, and the per-gateway error boundary."
status: "reviewed"
evidence_paths:
  - "../evidence/architecture.md"
  - "../evidence/overview.md"
source_paths:
  - "src/core/transcription-core.ts"
  - "src/core/default-transcriber-binding-factory.ts"
  - "src/core/transcriber-binding-input.ts"
  - "src/core/supported-providers.ts"
  - "src/core/index.ts"
  - "src/cli/transcription-cli-application.ts"
  - "src/mcp/main.ts"
  - "src/mcp/server.ts"
  - "src/mcp/resolve-infra.ts"
  - "src/mcp/assert-paths-within-root.ts"
  - "src/mcp/tool-schemas.ts"
  - "src/mcp/map-params-to-options.ts"
  - "src/mcp/map-result-to-output.ts"
  - "src/mcp/health.ts"
  - "src/mcp/stderr-logger.ts"
  - "src/mcp/AGENTS.md"
  - "esbuild.config.mjs"
  - "package.json"
  - "tests/integration/mcp-transcribe.test.ts"
  - ".omc/plans/mcp-core-gateway.md"
last_refined_on: "2026-06-07"
---
# Core + Gateways (CLI and MCP)

## What It Covers

This page documents the **core + gateways** shape introduced in commits `cd2109d`
(extract core) and `c802534` (MCP gateway). The transcription composition was
carved out of the CLI into a framework-agnostic **core** (`src/core/`) so it can
be driven by more than one adapter. Two **gateways** now sit over that core:

- the **CLI gateway** (`src/cli/`) — argv in, process exit code out;
- the **MCP gateway** (`src/mcp/`) — JSON-RPC `tools/call` in, `CallToolResult` out.

It explains what the core owns versus what each gateway owns, the MCP tool
surface (`transcribe` + `transcription_health`), the hard rules that keep the
gateways isolated (R2 per-call params, R3 env-only infra/secrets, R4 no
CLI imports, the error-boundary split, stdout purity), and how to configure and
run the MCP server.

## How It Works

### The shape: one core, two gateways

```
            argv  ─────────────▶  src/cli  (CLI gateway)  ─┐
                                                           │   runTranscriptionCore({ request,
                                                           ├─▶ provider, chunkDurationMs, logger,
   JSON-RPC tools/call ────────▶  src/mcp  (MCP gateway)  ─┘   createTranscriberBinding, ...deps })
                                                                        │
                                                                        ▼
                                                   src/core ─▶ RunBatchTranscriptionUseCase
                                                                        │
                                              application / domain / infrastructure
```

Both gateways translate their own input surface into the same core call and
translate the same structured result `{ exitCode, fileResults }` back into their
own output channel. The core is the single place transcription composition
lives; the gateways are thin and own only their I/O boundary.

### The core (`src/core/`)

`runTranscriptionCore(input)` (`src/core/transcription-core.ts`) composes the
default `FileJobStore` / `FFmpegMediaSegmenter` (each overridable via the `deps`
seams), runs `RunBatchTranscriptionUseCase` with the injected provider binding,
and returns the full structured `TranscriptionCoreResult` (`{ exitCode,
fileResults }`, aliased from the batch use case).

What the core consumes is a **gateway-neutral** `TranscriptionCoreInput`:

- `request: TranscriptionRequest` — the per-call values (`inputs`, `output`,
  `chunkDurationSeconds`, `concurrency`, `fileConcurrency`, `cleanupPolicy`,
  `resume`). This shape **intentionally carries no `provider`** — provider is
  resolved by the gateway and supplied separately.
- `provider`, `chunkDurationMs` — gateway-resolved scalars.
- `logger` — injected so each gateway controls where logs go.
- `createTranscriberBinding: (resolvedInputPath: string) => TranscriberBinding`
  — a **pinned single-arg thunk**, structurally identical to the batch use
  case's seam. Each gateway closes over its own `provider`/`chunkDurationMs`/
  `config` when building it.

What the core **does NOT do** (these stay gateway concerns):

- parse argv;
- load `.env`;
- validate the output directory;
- write to `process.stdout`;
- log the batch summary;
- **swallow errors** — throws propagate to the gateway's own outer boundary
  (the "ERROR-BOUNDARY SPLIT").

`DefaultTranscriberBindingFactory` was moved from `src/cli/` into `src/core/`.
Its input was narrowed from the CLI option type to a core-owned
`TranscriberBindingInput` (`{ provider, chunkDurationMs }`) so no gateway
argument type leaks into the core. The provider dispatch (`fake` /
`openai-whisper` / `openai-transcription`) and the per-call
`assertOpenAIAudioChunkFitsUploadLimit` chunk-size guard moved verbatim.
`src/cli/default-transcriber-binding-factory.ts` now re-exports the core class
for backward compatibility.

**Boundary:** `src/core/` imports neither `src/cli/` nor `src/mcp/` and never
references `CliOptions` / `cli-argument-parser`.

### The CLI gateway (`src/cli/`)

`TranscriptionCliApplication.run` (`src/cli/transcription-cli-application.ts`)
keeps every adapter concern and delegates composition to the core: it parses
argv, short-circuits `--help`/`--version`, normalizes input paths, runs
`assertOutputDirIsDirectory` (which **swallows** a non-existent dir, by design),
loads `.env`, builds the `TranscriptionRequest`, calls `runTranscriptionCore`,
logs the batch summary via `logBatchSummary`, and wraps everything in a
`try/catch` that maps any throw to **exit code 1**. `runCli` stays
`Promise<number>`. Single-file (`N=1`) behavior is byte-for-byte identical to
before the extraction.

### The MCP gateway (`src/mcp/`)

The MCP gateway is a sibling of the CLI over the same core. It exposes
transcription to an LLM client as MCP tools over stdio.

**Entrypoint & fail-fast (R3).** `main.ts` → `startMcpServer(env)` calls
`resolveInfra(env)` **before** building or connecting the server.
`resolveInfra` reads `MCP_TRANSCRIPTION_PROVIDER`, dispatches to the matching
`createXConfig(env)`, and lets any thrown `ValidationError` abort the process
with a non-zero exit code **before `server.connect`** — a misconfigured server
exits at startup instead of failing per call. ESM-main detection uses
`pathToFileURL`; fatal startup errors are written to **stderr** and set
`process.exitCode = 1`.

**Tools.** `server.ts` registers two tools:

| Tool | Input | Output |
|------|-------|--------|
| `transcribe` | R2 per-call params (see below) | `structuredContent = { exitCode, fileResults }`; human summary + buffered log in `content`; `isError: true` when `exitCode` is `1` or `2` |
| `transcription_health` | zero-arg | `{ provider, model, backend, ffmpegAvailable, ffprobeAvailable, serverVersion }` — never any secret |

**R2 — per-call tool params** (`tool-schemas.ts`, Zod raw shape):
`inputs` (≥1 path), `outputDir`, `chunkDurationSeconds` (positive int),
`concurrency` (positive int), `fileConcurrency` (positive int, default `1`),
`cleanupPolicy` (`on-success` | `keep`), `resume` (boolean, default `false`).

**R3 — infra/secrets are env-only, never tool params.** `provider`, `model`,
`apiKey`, `backend`, `endpoint`, `language`, and `prompt` are **deliberately
absent** from every tool schema. They are read from env and validated at server
startup via the existing `createXConfig(env)` throwers. Exposing them as tool
params would let a caller override server infra/secrets per request, which the
architecture forbids. The startup-validated infra is held in `ResolvedInfra`
(`{ provider, backend, model, allowedRoot, bindingFactory }`); `apiKey`/`endpoint`
are intentionally **not** stored there — only the non-secret `backend`/`model`
labels (plus the optional `allowedRoot`) surface, and the labels only for
`transcription_health`.

**R3 — filesystem containment (`MCP_ALLOWED_ROOT`, opt-in).** The `transcribe`
tool takes `inputs`/`outputDir` as agent-supplied paths. By default the gateway
keeps the **same filesystem reach as the CLI** — the trust model is *local
single-user, trusted LLM* (the server runs with the user's own privilege, just
like the CLI shell). When defense-in-depth is wanted (e.g. a multi-user or
less-trusted host), set `MCP_ALLOWED_ROOT`: `resolveInfra` resolves it to an
absolute path and `handleTranscribe` runs `assertPathsWithinRoot` **before
touching the filesystem**, so every resolved `input` and the `outputDir` must sit
**at or under** the root. `..` escapes and absolutes outside the root are
rejected as `ValidationError` → `isError` (never silently clamped). When the env
is unset/blank, `allowedRoot` is `null` and the check is a no-op.

**Per-call binding thunk.** `handleTranscribe` builds the binding thunk **fresh
on every `tools/call`** via `createPerCallBindingThunk(infra, chunkDurationMs)`,
so `assertOpenAIAudioChunkFitsUploadLimit` fires per call against *this*
request's `chunkDurationMs` (against the startup-built config). The binding is
never built once at startup.

**Result mapping** (`map-result-to-output.ts`). The previously-swallowed
`{ exitCode, fileResults }` is surfaced as `structuredContent`; `content`
carries a human-readable summary (`summarizeBatch` replicates the per-file
partial-failure detail the CLI emits via `logBatchSummary`, which stays
CLI-only) plus any buffered log lines. `exitCode != 0` sets `isError: true` so
the LLM can self-correct on partial (`2`) or fatal (`1`) failures while still
seeing per-file detail.

**Error boundary (the split).** The core does not swallow; `handleTranscribe`
wraps the core call in `try/catch` and converts any throw — chunk-size
assertion, bad `outputDir`, provider error — into an `isError` result via
`mapErrorToToolOutput`, without crashing the server. Note the contrast with the
CLI: the MCP output-dir guard **surfaces** a bad/missing `outputDir` (it becomes
`isError`), whereas the CLI's guard swallows it.

**stdout purity.** MCP stdio uses **stdout for JSON-RPC framing only**. Any log
line on stdout would corrupt the protocol stream, so the handler injects
`createStderrBufferLogger` (`stderr-logger.ts`): a `Logger` that writes to
**stderr** and to an in-memory buffer (never stdout), then `drain()`s the buffer
into the tool result so the agent sees what happened without polluting the wire.
`createChildLogger` (used by multi-input runs) wraps and inherits this base, so
child loggers are stdout-safe automatically. The default `createLogger` (which
writes INFO/WARN to stdout) must never be used here.

**R4 — no CLI dependency.** `src/mcp/**` must NOT import
`transcription-cli-application`, `cli-argument-parser`, or `runCli`, and must
never `spawn`/`exec` the CLI bundle. It depends only on `src/core/**` (plus
`application`/`infrastructure`/`domain`/`shared`). The `seconds * 1000`
conversion is inlined in `map-params-to-options.ts` specifically to avoid
importing the CLI's `toChunkDurationMs`. The only CLI leaf that may be reused is
`input-path-resolver`. This isolation is testable at the bundle level: esbuild
emits two separate ESM bundles, and `@modelcontextprotocol/sdk` is absent from
`dist/bundle.js` (CLI) and present only in `dist/mcp-server.js` (MCP).

### Configuration (env, R3)

Infra is a launch-time prerequisite. `MCP_TRANSCRIPTION_PROVIDER` selects the
provider; the rest of the env matches the CLI's provider configuration exactly
(same `createXConfig` throwers, so validation and messages are identical):

| `MCP_TRANSCRIPTION_PROVIDER` | Required env | Optional env |
|------------------------------|--------------|--------------|
| `fake` | — (never throws; test/dev provider) | `FAKE_*` (see `fake-transcriber`) |
| `openai-whisper` | `OPENAI_API_KEY` | `OPENAI_WHISPER_LANGUAGE`, `OPENAI_WHISPER_PROMPT` |
| `openai-transcription` (backend `openai`) | `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_API_KEY` | `OPENAI_TRANSCRIPTION_LANGUAGE`, `OPENAI_TRANSCRIPTION_PROMPT` |
| `openai-transcription` (backend `azure`) | `OPENAI_TRANSCRIPTION_MODEL`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `OPENAI_API_VERSION` | `AZURE_OPENAI_DEPLOYMENT`, `OPENAI_TRANSCRIPTION_LANGUAGE`, `OPENAI_TRANSCRIPTION_PROMPT` |

Only the two `openai-*` providers gate startup; `fake` is exempt by design
(`resolveFakeTranscriberOptions` clamps/filters and never throws).

`MCP_ALLOWED_ROOT` is an **optional, provider-independent** env (see R3 —
filesystem containment): unset means CLI-equivalent reach; set means every
`transcribe` path must resolve at or under that directory.

### Build & run

`package.json` adds the `mcp` script (`node dist/src/mcp/main.js`) and pins
`@modelcontextprotocol/sdk@1.29.0` and `zod@3.25.76`. `esbuild.config.mjs` emits
a second standalone bundle `dist/mcp-server.js` alongside the CLI's
`dist/bundle.js`; both bundles carry the `#!/usr/bin/env node` banner and the
build-time `__APP_VERSION__` define.

```bash
# From source (tsc), provider via env:
export MCP_TRANSCRIPTION_PROVIDER=openai-whisper
export OPENAI_API_KEY=sk-...
npm run mcp                 # node dist/src/mcp/main.js, speaks JSON-RPC on stdout

# Standalone bundle (no node_modules):
npm run build:bundle
MCP_TRANSCRIPTION_PROVIDER=fake node dist/mcp-server.js
```

A typical MCP client config points at the bundle and supplies the infra env:

```json
{
  "mcpServers": {
    "dnd-transcription": {
      "command": "node",
      "args": ["dist/mcp-server.js"],
      "env": { "MCP_TRANSCRIPTION_PROVIDER": "openai-whisper", "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

## Evidence

- Evidence pages: [Architecture Evidence](../evidence/architecture.md),
  [Deterministic Repository Evidence](../evidence/overview.md). These predate the
  core + gateways split, and the deterministic generator
  (`src/wiki/application/code-wiki-page-definitions.ts`) still enumerates only
  `src/cli` / `src/application` / `src/domain` / `src/infrastructure` — it has no
  page definition for `src/core` or `src/mcp`, so a plain `ingest`/`refresh` will
  not produce dedicated evidence for them. Every claim on this page was therefore
  verified directly against the raw sources below.
- Raw sources checked: `src/core/transcription-core.ts`,
  `src/core/default-transcriber-binding-factory.ts`,
  `src/core/transcriber-binding-input.ts`, `src/core/index.ts`,
  `src/cli/transcription-cli-application.ts`, `src/mcp/main.ts`,
  `src/mcp/server.ts`, `src/mcp/resolve-infra.ts`, `src/mcp/tool-schemas.ts`,
  `src/mcp/map-params-to-options.ts`, `src/mcp/map-result-to-output.ts`,
  `src/mcp/health.ts`, `src/mcp/stderr-logger.ts`, `src/mcp/AGENTS.md`,
  `esbuild.config.mjs`, `package.json`, the provider config factories, and the
  plan `.omc/plans/mcp-core-gateway.md`.
- Verification spot-checks: `tests/integration/mcp-transcribe.test.ts` plus the
  `tests/unit/mcp/*` suites (`resolve-infra`, `tool-schemas`,
  `map-params-to-options`, `map-result-to-output`, `health`, `stderr-logger`).
  Per the `c802534` commit message, the full suite is 202/202 green; stdout
  purity is asserted (0 `process.stdout.write` in the handler) and a fail-fast
  smoke test (`openai-whisper` without `OPENAI_API_KEY`) exits 1 with empty
  stdout.

## Open Questions

- The deterministic evidence layer has no dedicated module-evidence pages for
  `src/core/` or `src/mcp/`: the generator's page definitions in
  `src/wiki/application/code-wiki-page-definitions.ts` only enumerate the original
  four layers, and `evidence/architecture.md`'s `source_paths` list those same
  paths. Adding deterministic evidence for the core and the gateways requires
  extending those page definitions (a code change), not just an `ingest`/`refresh`.
- The MCP surface is V1: only `fake`, `openai-whisper`, and
  `openai-transcription` are dispatched at startup. The supported set + the
  unknown-provider message now live in one place — `src/core/supported-providers.ts`
  (`SUPPORTED_PROVIDERS` / `unsupportedProviderMessage`) — consumed by both
  `DefaultTranscriberBindingFactory` (core) and `resolveInfra` (MCP startup
  dispatch); the parity test `tests/unit/core/supported-providers.test.ts` fails
  if the two accept different sets. A new provider must still be wired into the
  concrete dispatch in **both** places (factory → binding, `resolveInfra` →
  backend/model labels) and added to `SUPPORTED_PROVIDERS`; the tool schema does
  not change.
- `transcription_health` is **stateless by design**: each call re-probes
  ffmpeg/ffprobe (timeout-bounded via `runCommand`'s opt-in `timeoutMs`, so a
  hung binary cannot wedge it) so the result reflects the live PATH. A short-TTL
  availability cache is a documented `TODO OPT` if an agent ever polls health in
  a tight loop.

## Related Pages

- [Architecture Overview](./architecture.md)
- [Module Boundaries](./module-boundaries.md)
- [Provider Adapters](./provider-adapters.md)
- [Transcription Job Workflow](./transcription-job.md)
- [CLI on Commander (ADR)](./cli-commander-migration.md)
