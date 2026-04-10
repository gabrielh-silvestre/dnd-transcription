import { spawn } from "node:child_process";

import { ExternalCommandError } from "./errors.js";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
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

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      const message = error instanceof Error && "code" in error && error.code === "ENOENT"
        ? `Comando externo nao encontrado no PATH: ${binary}`
        : String(error);
      rejectPromise(new ExternalCommandError(command, stdout, `${stderr}${message}`.trim(), { cause: error }));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      rejectPromise(new ExternalCommandError(command, stdout, stderr));
    });
  });
}
