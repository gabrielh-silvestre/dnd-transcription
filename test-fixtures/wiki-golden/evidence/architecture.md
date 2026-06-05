---
title: "Architecture Evidence"
category: foundation
summary: "Auto-generated layer map, dependency direction, and source inventories."
source_paths:
  - "src/cli"
  - "src/application"
  - "src/domain"
  - "src/infrastructure"
  - "README.md"
  - ".omx/plans/brownfield-map.md"
---
# Architecture Evidence

This file captures deterministic architectural evidence. Use it as a base for refined architecture documentation.

## Layer map

```mermaid
flowchart TD
  CLI[CLI adapters\nsrc/cli]
  APP[Application use cases\nsrc/application]
  DOMAIN[Domain entities and ports\nsrc/domain]
  INFRA[Infrastructure adapters\nsrc/infrastructure]

  CLI --> APP
  APP --> DOMAIN
  APP --> INFRA
  INFRA --> DOMAIN
```

## Boundary evidence

- CLI reads argv, resolves inputs, loads environment variables, and composes dependencies.
- Application owns orchestration and end-to-end control flow.
- Domain owns lifecycle rules, compatibility checks, and contracts.
- Infrastructure implements ports and isolates filesystem, subprocess, SDK, and network details.

## File inventories

### CLI

- `src/cli/main.ts`

### Application

- `src/application/run-transcription-job-use-case.ts`

### Domain

- `src/domain/entities/job.ts`

### Infrastructure

- `src/infrastructure/providers/fake-transcriber.ts`
- `src/infrastructure/storage/file-job-store.ts`
