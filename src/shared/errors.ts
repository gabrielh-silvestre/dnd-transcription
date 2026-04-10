export type PipelineExitCode = 0 | 1 | 2;

export class AppError extends Error {
  public readonly exitCode: PipelineExitCode;
  public readonly phase: string;

  public constructor(message: string, exitCode: PipelineExitCode = 1, phase = "job", options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.exitCode = exitCode;
    this.phase = phase;
  }
}

export class ValidationError extends AppError {
  public constructor(message: string, phase = "cli", options?: ErrorOptions) {
    super(message, 1, phase, options);
  }
}

export class ExternalCommandError extends AppError {
  public readonly command: string[];
  public readonly stdout: string;
  public readonly stderr: string;

  public constructor(command: string[], stdout: string, stderr: string, options?: ErrorOptions) {
    super(`Falha ao executar comando externo: ${command.join(" ")}`, 1, "process", options);
    this.command = command;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : JSON.stringify(error));
}

export function summarizeError(error: unknown): string {
  const normalized = toError(error);
  return normalized.message;
}
