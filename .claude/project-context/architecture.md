# Shared Architecture Snapshot

`docs/wiki/architecture.md` is the canonical high-level architecture page. Use it as the first durable reference before re-reading raw code.

## Layer map

- `src/cli/`: parse/help/env/bootstrap/provider binding selection
- `src/application/`: workflow orchestration and final merge
- `src/domain/`: aggregates, compatibility snapshot, ports, and exit-code logic
- `src/infrastructure/`: storage, media tooling, concurrency, and provider adapters
- `src/wiki/`: maintenance CLI for the code wiki in `docs/wiki/`

## Core invariants

- Job persistence remains backward compatible through `manifest.json` and `job-state.json`.
- Resume compatibility remains strict and signature-based.
- Provider creation remains lazy through `TranscriberBinding`.
- Most tests remain offline and dependency-injected.

## Documentation contract

- `docs/wiki/` is the persistent documentation layer for the codebase.
- When code structure or behavior changes materially, update the relevant wiki pages or run `npm run wiki -- ingest ...` / `npm run wiki -- refresh`.
