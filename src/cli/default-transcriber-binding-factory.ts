/**
 * Compatibility re-export. The binding factory now lives in `src/core/` so both
 * the CLI and MCP gateways can construct transcriber bindings over the shared,
 * framework-agnostic core (see plan: TRANSCRIBER-BINDING OWNERSHIP). The CLI
 * keeps importing it from this path; the implementation is core-owned.
 */
export {
  DefaultTranscriberBindingFactory,
  type DefaultTranscriberBindingFactoryDependencies,
  type OpenAIProviderConfig,
  type TranscriberBindingFactory,
} from "../core/default-transcriber-binding-factory.js";
