import {
  DefaultTranscriberBindingFactory,
  type TranscriberBindingFactory,
} from "../core/default-transcriber-binding-factory.js";
import { type TranscriberBinding } from "../domain/ports/transcriber-binding.js";
import { resolveFakeTranscriberOptions } from "../infrastructure/providers/fake-transcriber.js";
import {
  createOpenAITranscriptionConfig,
  OPENAI_TRANSCRIPTION_PROVIDER,
} from "../infrastructure/providers/openai-transcription-config.js";
import {
  createOpenAIWhisperConfig,
  OPENAI_WHISPER_PROVIDER,
} from "../infrastructure/providers/openai-whisper-config.js";
import { ValidationError } from "../shared/errors.js";

export const MCP_PROVIDER_ENV_VAR = "MCP_TRANSCRIPTION_PROVIDER";

const FAKE_PROVIDER = "fake" as const;

/**
 * The startup-validated infra the MCP gateway injects into every core call.
 * `provider` is env-derived (R3) — it is NEVER a tool param — and `backend`/
 * `model` are surfaced ONLY for the no-secret `transcription_health` tool.
 * `apiKey`/`endpoint` and other secrets are intentionally NOT held here.
 */
export interface ResolvedInfra {
  provider: string;
  /** Backend label for `transcription_health` (e.g. "openai", "azure", "fake"). */
  backend: string;
  /** Model label for `transcription_health` (null for the fake provider). */
  model: string | null;
  /** Factory bound to the startup env; the gateway calls it per request. */
  bindingFactory: TranscriberBindingFactory;
}

/**
 * R3 fail-fast startup dispatch. Reads `MCP_TRANSCRIPTION_PROVIDER` from env,
 * dispatches to the matching `createXConfig(env)`, and lets any thrown
 * `ValidationError` ABORT the process (non-zero exit) BEFORE `server.connect`.
 *
 * NOTE: `resolveFakeTranscriberOptions` clamps/filters and never throws on
 * invalid env (intentional — `fake` is the test/dev provider), so the `fake`
 * branch is a no-op validation. Only the two `openai-*` providers gate startup.
 *
 * Per-call note: the returned `bindingFactory.create({ provider, chunkDurationMs })`
 * runs `assertOpenAIAudioChunkFitsUploadLimit` internally, so the chunk-size
 * invariant fires PER CALL with the request's `chunkDurationMs` against the
 * startup-built config — the gateway must build the binding thunk per request,
 * never once at startup.
 */
export function resolveInfra(env: NodeJS.ProcessEnv = process.env): ResolvedInfra {
  const provider = env[MCP_PROVIDER_ENV_VAR]?.trim();

  if (provider === undefined || provider.length === 0) {
    throw new ValidationError(
      `${MCP_PROVIDER_ENV_VAR} e obrigatoria para iniciar o servidor MCP.`,
      "provider",
    );
  }

  const bindingFactory = new DefaultTranscriberBindingFactory({ env });

  if (provider === FAKE_PROVIDER) {
    // No-op validation by design (resolveFakeTranscriberOptions never throws).
    resolveFakeTranscriberOptions(env);
    return { provider, backend: FAKE_PROVIDER, model: null, bindingFactory };
  }

  if (provider === OPENAI_WHISPER_PROVIDER) {
    const config = createOpenAIWhisperConfig(env);
    return { provider, backend: config.backend, model: config.model, bindingFactory };
  }

  if (provider === OPENAI_TRANSCRIPTION_PROVIDER) {
    const config = createOpenAITranscriptionConfig(env);
    return { provider, backend: config.backend, model: config.model, bindingFactory };
  }

  throw new ValidationError(
    `Provedor '${provider}' nao esta implementado nesta V1.`,
    "provider",
  );
}

/**
 * Builds the core's pinned single-arg binding thunk for one `tools/call`. The
 * thunk closes over the env-derived `provider` and the per-call `chunkDurationMs`
 * and delegates to the moved `DefaultTranscriberBindingFactory.create` — so the
 * per-call chunk-size assertion fires when the core invokes it.
 */
export function createPerCallBindingThunk(
  infra: ResolvedInfra,
  chunkDurationMs: number,
): (resolvedInputPath: string) => TranscriberBinding {
  return () => infra.bindingFactory.create({ provider: infra.provider, chunkDurationMs });
}
