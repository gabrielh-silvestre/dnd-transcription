# Shared Architecture Snapshot

`docs/wiki/pages/architecture.md` is the canonical high-level architecture page. Use it as the first durable reference before re-reading raw code.

## Layer map

- `src/core/`: framework-agnostic composition (`runTranscriptionCore`) + the moved default transcriber binding factory; shared by both gateways
- `src/cli/`: CLI gateway — parse/help/env/bootstrap/provider binding selection; delegates execution to the core
- `src/mcp/`: MCP stdio gateway — `transcribe`/`transcription_health` tools; env-only infra (R3 fail-fast); stdout reserved for JSON-RPC
- `src/application/`: workflow orchestration and final merge
- `src/domain/`: aggregates, compatibility snapshot, ports, and exit-code logic
- `src/infrastructure/`: storage, media tooling, concurrency, and provider adapters
- `src/wiki/`: maintenance CLI for the code wiki in `docs/wiki/`

The core + gateways shape is documented in `docs/wiki/pages/mcp-gateway.md`.

## Core invariants

- Job persistence remains backward compatible through `manifest.json` and `job-state.json`.
- Resume compatibility remains strict and signature-based.
- Provider creation remains lazy through `TranscriberBinding`.
- Most tests remain offline and dependency-injected.
- Gateway isolation: `src/core/` imports neither gateway; `src/mcp/` never imports the CLI nor spawns its bundle (R4).
- MCP infra/secrets (provider/model/key/backend/endpoint) are startup env only, never tool params; stdout carries only JSON-RPC.

## Documentation contract

- `docs/wiki/` is the persistent documentation layer for the codebase.
- When code structure or behavior changes materially, update the relevant wiki pages or run `npm run wiki -- ingest ...` / `npm run wiki -- refresh`.
