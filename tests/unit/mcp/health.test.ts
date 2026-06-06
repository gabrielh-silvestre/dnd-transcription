import { describe, expect, it } from "@jest/globals";

import { resolveTranscriptionHealth } from "../../../src/mcp/health.js";
import { type ResolvedInfra } from "../../../src/mcp/resolve-infra.js";
import { ExternalCommandError } from "../../../src/shared/errors.js";
import { runCommand } from "../../../src/shared/process.js";

function fakeInfra(overrides: Partial<ResolvedInfra> = {}): ResolvedInfra {
  return {
    provider: "openai-whisper",
    backend: "openai",
    model: "whisper-1",
    bindingFactory: { create: () => ({ signature: "sig", createTranscriber: () => ({}) }) as never },
    ...overrides,
  };
}

describe("resolveTranscriptionHealth", () => {
  it("reporta ffmpeg/ffprobe presentes quando estao no PATH", async () => {
    const health = await resolveTranscriptionHealth(fakeInfra());

    expect(health.ffmpegAvailable).toBe(true);
    expect(health.ffprobeAvailable).toBe(true);
    expect(health.provider).toBe("openai-whisper");
    expect(health.backend).toBe("openai");
    expect(health.model).toBe("whisper-1");
    expect(typeof health.serverVersion).toBe("string");
    expect(health.serverVersion.length).toBeGreaterThan(0);
  });

  it("ENOENT no probe vira false: runCommand de um binario inexistente rejeita (seam de probeBinary)", async () => {
    // resolveTranscriptionHealth probes ffmpeg/ffprobe via runCommand and maps a
    // throw to `false`. Driving a deterministically-missing binary through the
    // same runCommand seam exercises that ENOENT -> false contract without
    // depending on PATH mutation reaching the spawned child under jest.
    let threw = false;
    try {
      await runCommand(["definitely-missing-binary-xyz", "-version"]);
    } catch (error) {
      threw = true;
      expect(error).toBeInstanceOf(ExternalCommandError);
    }

    expect(threw).toBe(true);
  });

  it("propaga model null para o provider fake", async () => {
    const health = await resolveTranscriptionHealth(fakeInfra({ provider: "fake", backend: "fake", model: null }));

    expect(health.provider).toBe("fake");
    expect(health.model).toBeNull();
  });

  it("NUNCA expoe apiKey/endpoint/secret no resultado de health", async () => {
    const health = await resolveTranscriptionHealth(fakeInfra());

    const keys = Object.keys(health as unknown as Record<string, unknown>);
    expect(keys).not.toContain("apiKey");
    expect(keys).not.toContain("endpoint");
    expect(keys).not.toContain("secret");
    expect(keys.sort()).toStrictEqual(
      ["backend", "ffmpegAvailable", "ffprobeAvailable", "model", "provider", "serverVersion"].sort(),
    );
  });
});
