import process from "node:process";

import { describe, expect, it } from "@jest/globals";

import { createStderrBufferLogger } from "../../../src/mcp/stderr-logger.js";

interface StreamSpy {
  writes: string[];
  restore: () => void;
}

function spyOnStream(stream: NodeJS.WriteStream): StreamSpy {
  const original = stream.write.bind(stream);
  const writes: string[] = [];
  const spy = ((chunk: unknown, ...rest: unknown[]) => {
    writes.push(String(chunk));
    return (original as unknown as (...a: unknown[]) => boolean)(chunk, ...rest);
  }) as unknown as typeof stream.write;
  stream.write = spy;

  return {
    writes,
    restore() {
      stream.write = original;
    },
  };
}

describe("createStderrBufferLogger", () => {
  it("escreve apenas em stderr, nunca em stdout", () => {
    const stdoutSpy = spyOnStream(process.stdout);
    const stderrSpy = spyOnStream(process.stderr);

    try {
      const { logger } = createStderrBufferLogger();
      logger.info("scope", "linha info");
      logger.warn("scope", "linha warn");
      logger.error("scope", "linha error");
    } finally {
      stdoutSpy.restore();
      stderrSpy.restore();
    }

    expect(stdoutSpy.writes).toHaveLength(0);
    expect(stderrSpy.writes.length).toBeGreaterThanOrEqual(3);
  });

  it("acumula cada linha no buffer e drain() devolve um snapshot na ordem (mais antiga primeiro)", () => {
    const stderrSpy = spyOnStream(process.stderr);
    let buffered: string[];

    try {
      const { logger, drain } = createStderrBufferLogger();
      logger.info("alpha", "primeira");
      logger.warn("beta", "segunda", { k: 1 });
      logger.error("gamma", "terceira");
      buffered = drain();
    } finally {
      stderrSpy.restore();
    }

    expect(buffered).toHaveLength(3);
    expect(buffered[0]).toMatch(/INFO \[alpha\] primeira/);
    expect(buffered[1]).toMatch(/WARN \[beta\] segunda/);
    expect(buffered[1]).toMatch(/\{"k":1\}/);
    expect(buffered[2]).toMatch(/ERROR \[gamma\] terceira/);
  });

  it("drain() devolve copias independentes (snapshot imutavel)", () => {
    const stderrSpy = spyOnStream(process.stderr);

    try {
      const { logger, drain } = createStderrBufferLogger();
      logger.info("scope", "uma");
      const first = drain();
      first.push("mutacao externa");
      logger.info("scope", "duas");
      const second = drain();

      expect(second).toHaveLength(2);
      expect(second).not.toContain("mutacao externa");
    } finally {
      stderrSpy.restore();
    }
  });
});
