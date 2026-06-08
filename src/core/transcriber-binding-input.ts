/**
 * Core-owned, gateway-neutral input for {@link DefaultTranscriberBindingFactory}.
 *
 * This intentionally narrows the previous gateway-arg dependency to just the
 * two fields the binding construction needs (`provider` for dispatch and
 * `chunkDurationMs` for the per-call upload-limit assertion), so no gateway arg
 * type (the CLI option type or any MCP schema type) leaks into `src/core`.
 */
export interface TranscriberBindingInput {
  provider: string;
  chunkDurationMs: number;
}
