import { spawn } from "node:child_process";

import { ExternalCommandError } from "./errors.js";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * When set, the child is killed and the call rejects with
   * `ExternalCommandError` if it does not finish within this many milliseconds.
   * Opt-in: omitted means no timeout (the long-running transcription path keeps
   * waiting as before). Used by the MCP health probe so a hung ffmpeg/ffprobe
   * cannot wedge `transcription_health`.
   */
  timeoutMs?: number;
}

export async function runCommand(command: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  const [binary, ...args] = command;

  return await new Promise<CommandResult>((resolvePromise, rejectPromise) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const clearTimer = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    if (options.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        child.kill("SIGKILL");
        rejectPromise(
          new ExternalCommandError(
            command,
            stdout,
            `${stderr}Tempo limite excedido apos ${options.timeoutMs}ms`.trim(),
          ),
        );
      }, options.timeoutMs);
      // Do not keep the event loop alive solely for this watchdog timer.
      timer.unref();
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimer();
      const message = error instanceof Error && "code" in error && error.code === "ENOENT"
        ? `Comando externo nao encontrado no PATH: ${binary}`
        : String(error);
      rejectPromise(new ExternalCommandError(command, stdout, `${stderr}${message}`.trim(), { cause: error }));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimer();
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      rejectPromise(new ExternalCommandError(command, stdout, stderr));
    });
  });
}
