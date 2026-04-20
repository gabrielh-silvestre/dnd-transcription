---
title: "Transcription Workflow Evidence"
category: workflow
summary: "Observed execution path from CLI input to final transcript output."
source_paths:
  - "src/cli"
  - "src/application"
  - "src/domain"
  - "src/infrastructure"
---
# Transcription Workflow Evidence

This file is deterministic evidence for the end-to-end transcription workflow.

```mermaid
sequenceDiagram
  participant User
  participant CLI
  participant UseCase
  participant Store
  participant Segmenter
  participant Binding
  participant Provider
  participant Merge

  User->>CLI: run transcription command
  CLI->>CLI: parse args and load env
  CLI->>Binding: resolve provider binding
  CLI->>UseCase: execute
  UseCase->>Store: initialize or resume job
  alt new job
    UseCase->>Segmenter: segment media
    Segmenter-->>UseCase: manifest
    UseCase->>Store: persist manifest and hydrate chunks
  end
  UseCase->>Binding: create transcriber if pending chunks exist
  Binding-->>Provider: transcriber instance
  loop pending chunks
    UseCase->>Store: mark chunk running
    UseCase->>Provider: transcribe normalized WAV
    alt success
      UseCase->>Store: write chunk markdown and mark succeeded
    else failure
      UseCase->>Store: mark failed
    end
  end
  alt all chunks succeeded
    UseCase->>Merge: assemble transcript.md
    Merge->>Store: write final markdown
  else partial failure
    UseCase->>Store: mark partial_failed
  end
```

## Observed exit paths

- Full success: final markdown written and exit code `0`
- Partial failure: reusable state persisted and exit code `2`
- Fatal error: job moves to `fatal_error` when possible and exit code `1`
