# Memory Workflow

## Goal

Keep future sessions aligned around the code wiki and the shared project context instead of rediscovering architecture from scratch.

## Start of session

1. Read `current-state.md`.
2. Read `architecture.md`.
3. Read `docs/wiki/index.md`.
4. Read `docs/wiki/schema.md`.
5. Read raw files only for the specific slice being edited or verified.

## During implementation

- When a slice changes architecture, ownership, or major behavior, update `docs/wiki/`.
- Prefer `npm run wiki -- ingest --source <path>` for targeted updates.
- Use `npm run wiki -- refresh` when multiple modules drifted.

## End of session

- Ensure `docs/wiki/log.md` reflects wiki maintenance actions.
- Update `current-state.md` if the repository state changed materially.
- Optionally leave a handoff in `logs/` using the session template.
