<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# concurrency

## Purpose
Bounded-concurrency task execution primitive used by the application layer to transcribe chunks in parallel without exceeding a configured worker count.

## Key Files
| File | Description |
|------|-------------|
| `task-pool.ts` | Generic `runTaskPool<T>(input)` with `RunTaskPoolInput<T>`. Distributes `items` across up to `concurrency` workers via a shared `nextIndex` counter (work-stealing); short-circuits on an empty list; validates `concurrency` is a positive integer. |

## For AI Agents

### Working In This Directory
- `concurrency` must be a positive integer — validated at entry (throws otherwise).
- No backpressure: up to `concurrency` workers start immediately and pull the next index as they finish.
- Errors propagate via `Promise.all` — the first rejection surfaces. The transcription use case wraps per-chunk work so a single chunk failure is recorded as chunk state rather than aborting the whole pool; keep that contract intact if you change error flow here.

### Testing Requirements
`tests/unit/task-pool.test.ts` covers concurrency limits and error handling. Keep it deterministic (no real timers required).

## Dependencies

### Internal
None.

### External
None (pure async/Promises).
