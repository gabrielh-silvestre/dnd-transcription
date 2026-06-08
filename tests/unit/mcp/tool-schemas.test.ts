import { describe, expect, it } from "@jest/globals";
import { z } from "zod";

import {
  healthToolInputShape,
  transcribeToolInputShape,
} from "../../../src/mcp/tool-schemas.js";

const transcribeSchema = z.object(transcribeToolInputShape);

function validParams(): Record<string, unknown> {
  return {
    inputs: ["/abs/a.mkv"],
    outputDir: "/abs/out",
    chunkDurationSeconds: 60,
    concurrency: 2,
    cleanupPolicy: "keep",
  };
}

describe("transcribeToolInputShape", () => {
  it("aceita um payload valido e aplica defaults (fileConcurrency=1, resume=false)", () => {
    const parsed = transcribeSchema.parse(validParams());

    expect(parsed.fileConcurrency).toBe(1);
    expect(parsed.resume).toBe(false);
  });

  it("rejeita chunkDurationSeconds <= 0", () => {
    expect(() => transcribeSchema.parse({ ...validParams(), chunkDurationSeconds: 0 })).toThrow();
    expect(() => transcribeSchema.parse({ ...validParams(), chunkDurationSeconds: -5 })).toThrow();
  });

  it("rejeita chunkDurationSeconds nao-inteiro", () => {
    expect(() => transcribeSchema.parse({ ...validParams(), chunkDurationSeconds: 1.5 })).toThrow();
  });

  it("rejeita concurrency <= 0", () => {
    expect(() => transcribeSchema.parse({ ...validParams(), concurrency: 0 })).toThrow();
  });

  it("rejeita fileConcurrency <= 0 quando fornecido", () => {
    expect(() => transcribeSchema.parse({ ...validParams(), fileConcurrency: 0 })).toThrow();
  });

  it("rejeita cleanupPolicy fora do enum", () => {
    expect(() => transcribeSchema.parse({ ...validParams(), cleanupPolicy: "delete-all" })).toThrow();
  });

  it("rejeita inputs vazio (min 1)", () => {
    expect(() => transcribeSchema.parse({ ...validParams(), inputs: [] })).toThrow();
  });

  it("rejeita campos obrigatorios faltantes (outputDir)", () => {
    const { outputDir: _omit, ...rest } = validParams();
    expect(() => transcribeSchema.parse(rest)).toThrow();
  });

  it("GUARD R3: o schema NAO contem provider/model/apiKey/backend/endpoint/language/prompt", () => {
    const keys = Object.keys(transcribeToolInputShape);
    const forbidden = ["provider", "model", "apiKey", "backend", "endpoint", "language", "prompt", "secret"];

    for (const key of forbidden) {
      expect(keys).not.toContain(key);
    }
  });
});

describe("healthToolInputShape", () => {
  it("e um shape vazio (ferramenta zero-arg)", () => {
    expect(Object.keys(healthToolInputShape)).toHaveLength(0);
  });
});
