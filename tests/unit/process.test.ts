import { describe, expect, it } from "@jest/globals";

import { ExternalCommandError } from "../../src/shared/errors.js";
import { runCommand } from "../../src/shared/process.js";

describe("runCommand timeout (opt-in)", () => {
  it("mata o processo e rejeita quando excede timeoutMs", async () => {
    let captured: unknown;

    try {
      // A child that would run far longer than the watchdog.
      await runCommand(["node", "-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 200 });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(ExternalCommandError);
    expect((captured as ExternalCommandError).stderr).toMatch(/Tempo limite excedido/);
  });

  it("nao aplica timeout quando timeoutMs e omitido (comando rapido resolve)", async () => {
    const result = await runCommand(["node", "-e", "process.stdout.write('ok')"]);

    expect(result.stdout).toBe("ok");
  });

  it("resolve normalmente quando o comando termina dentro do timeoutMs", async () => {
    const result = await runCommand(["node", "-e", "process.stdout.write('fast')"], {
      timeoutMs: 5_000,
    });

    expect(result.stdout).toBe("fast");
  });
});
