import { runCommand } from "../../shared/process.js";

export interface ProbeMediaInput {
  inputPath: string;
  ffprobePath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ProbeMediaResult {
  durationMs: number;
}

interface FFprobeOutput {
  format?: {
    duration?: string;
  };
}

export async function probeMedia(input: ProbeMediaInput): Promise<ProbeMediaResult> {
  const command = [
    input.ffprobePath ?? "ffprobe",
    "-v",
    "error",
    "-show_format",
    "-of",
    "json",
    input.inputPath,
  ];
  const result = await runCommand(command, { env: input.env });
  const parsed = JSON.parse(result.stdout) as FFprobeOutput;
  const durationSeconds = Number.parseFloat(parsed.format?.duration ?? "");

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`ffprobe retornou duracao invalida para ${input.inputPath}`);
  }

  return {
    durationMs: Math.round(durationSeconds * 1_000),
  };
}
