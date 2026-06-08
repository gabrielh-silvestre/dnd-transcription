import { OPENAI_TRANSCRIPTION_PROVIDER } from "../infrastructure/providers/openai-transcription-config.js";
import { OPENAI_WHISPER_PROVIDER } from "../infrastructure/providers/openai-whisper-config.js";

/** The dev/test provider; never requires secrets and never throws on bad env. */
export const FAKE_PROVIDER = "fake" as const;

/**
 * Single source of truth for the providers the V1 surface dispatches. Both the
 * core binding factory (`DefaultTranscriberBindingFactory`) and the MCP startup
 * dispatch (`resolveInfra`) reject unknown providers via
 * {@link unsupportedProviderMessage}, so the two gateways can never drift on
 * WHICH providers exist or on the message they emit. Adding a provider means
 * adding it here AND wiring its concrete dispatch in both places — the parity
 * test (`tests/unit/core/supported-providers.test.ts`) fails if they diverge.
 */
export const SUPPORTED_PROVIDERS = [
  FAKE_PROVIDER,
  OPENAI_WHISPER_PROVIDER,
  OPENAI_TRANSCRIPTION_PROVIDER,
] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(provider: string): provider is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}

/** The single canonical message for an unknown/unimplemented provider. */
export function unsupportedProviderMessage(provider: string): string {
  return `Provedor '${provider}' nao esta implementado nesta V1.`;
}
