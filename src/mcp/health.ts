import { resolveAppVersion } from "../shared/app-version.js";
import { runCommand } from "../shared/process.js";
import { type ResolvedInfra } from "./resolve-infra.js";

/**
 * Result of the zero-arg `transcription_health` tool. Lets the agent confirm the
 * server is correctly configured before transcribing. It NEVER returns
 * `apiKey`/`endpoint` or any other secret — only the non-sensitive provider
 * label, model, backend, binary availability, and server version.
 */
export interface TranscriptionHealth {
  provider: string;
  model: string | null;
  backend: string;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  serverVersion: string;
}

/** Watchdog so a hung ffmpeg/ffprobe cannot wedge `transcription_health`. */
const PROBE_TIMEOUT_MS = 5_000;

async function probeBinary(binary: string): Promise<boolean> {
  try {
    await runCommand([binary, "-version"], { timeoutMs: PROBE_TIMEOUT_MS });
    return true;
  } catch {
    // ENOENT / ExternalCommandError / timeout -> not available.
    return false;
  }
}

/**
 * Health is stateless by design: each call re-probes ffmpeg/ffprobe so the
 * result always reflects the live PATH. The probe is cheap and timeout-bounded.
 *
 * TODO OPT: if an agent polls health in a tight loop, cache the binary
 * availability behind a short TTL to avoid spawning two processes per call.
 */
export async function resolveTranscriptionHealth(infra: ResolvedInfra): Promise<TranscriptionHealth> {
  const [ffmpegAvailable, ffprobeAvailable] = await Promise.all([
    probeBinary("ffmpeg"),
    probeBinary("ffprobe"),
  ]);

  return {
    provider: infra.provider,
    model: infra.model,
    backend: infra.backend,
    ffmpegAvailable,
    ffprobeAvailable,
    serverVersion: resolveAppVersion(),
  };
}
