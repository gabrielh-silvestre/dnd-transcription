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

async function probeBinary(binary: string): Promise<boolean> {
  try {
    await runCommand([binary, "-version"]);
    return true;
  } catch {
    // ENOENT / ExternalCommandError -> not available.
    return false;
  }
}

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
