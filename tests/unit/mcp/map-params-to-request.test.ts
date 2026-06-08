import { describe, expect, it } from "@jest/globals";

import { mapParamsToRequest } from "../../../src/mcp/map-params-to-request.js";
import { type TranscribeToolInput } from "../../../src/mcp/tool-schemas.js";

function createParams(overrides: Partial<TranscribeToolInput> = {}): TranscribeToolInput {
  return {
    inputs: ["/abs/a.mkv"],
    outputDir: "/abs/out",
    chunkDurationSeconds: 60,
    concurrency: 2,
    fileConcurrency: 1,
    cleanupPolicy: "keep",
    resume: false,
    ...overrides,
  };
}

describe("mapParamsToRequest", () => {
  it("repassa caminhos absolutos sem alteracao (abs passthrough)", () => {
    const { request } = mapParamsToRequest(
      createParams({ inputs: ["/abs/a.mkv", "/abs/b.mkv"], outputDir: "/abs/out" }),
    );

    expect(request.inputs).toStrictEqual(["/abs/a.mkv", "/abs/b.mkv"]);
    expect(request.output).toBe("/abs/out");
  });

  it("repassa caminhos relativos crus, sem resolver/ignorar (raw)", () => {
    const { request } = mapParamsToRequest(
      createParams({ inputs: ["a.mkv", "sub/b.mkv"], outputDir: "out" }),
    );

    expect(request.inputs).toStrictEqual(["a.mkv", "sub/b.mkv"]);
    expect(request.output).toBe("out");
  });

  it("deriva chunkDurationMs a partir de chunkDurationSeconds (x1000)", () => {
    const { chunkDurationMs } = mapParamsToRequest(createParams({ chunkDurationSeconds: 90 }));

    expect(chunkDurationMs).toBe(90_000);
    expect(mapParamsToRequest(createParams({ chunkDurationSeconds: 1 })).chunkDurationMs).toBe(1_000);
  });

  it("preserva fileConcurrency (default 1 ja aplicado pelo schema) no request", () => {
    const { request } = mapParamsToRequest(createParams({ fileConcurrency: 1 }));
    expect(request.fileConcurrency).toBe(1);

    const explicit = mapParamsToRequest(createParams({ fileConcurrency: 4 }));
    expect(explicit.request.fileConcurrency).toBe(4);
  });

  it("mapeia concurrency, cleanupPolicy e resume sem alteracao", () => {
    const { request } = mapParamsToRequest(
      createParams({ concurrency: 3, cleanupPolicy: "on-success", resume: true }),
    );

    expect(request.concurrency).toBe(3);
    expect(request.cleanupPolicy).toBe("on-success");
    expect(request.resume).toBe(true);
  });

  it("NUNCA injeta provider a partir dos params (provider e env-only, vem do startup)", () => {
    const { request } = mapParamsToRequest(createParams());

    expect((request as unknown as Record<string, unknown>).provider).toBeUndefined();
    expect(Object.keys(request)).not.toContain("provider");
  });
});
