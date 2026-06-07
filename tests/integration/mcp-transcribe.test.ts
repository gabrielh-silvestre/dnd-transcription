import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "@jest/globals";

import { runTranscriptionCore, type TranscriptionRequest } from "../../src/core/transcription-core.js";
import { mapParamsToRequest } from "../../src/mcp/map-params-to-options.js";
import { mapResultToToolOutput } from "../../src/mcp/map-result-to-output.js";
import { createPerCallBindingThunk, resolveInfra, MCP_PROVIDER_ENV_VAR } from "../../src/mcp/resolve-infra.js";
import { createTranscriptionMcpServer } from "../../src/mcp/server.js";
import { createStderrBufferLogger } from "../../src/mcp/stderr-logger.js";
import { type TranscribeToolInput } from "../../src/mcp/tool-schemas.js";
import { FileJobStore } from "../../src/infrastructure/storage/file-job-store.js";
import { type BatchFileResult } from "../../src/application/run-batch-transcription-use-case.js";
import { deriveJobSubdir, resolveJobPaths } from "../../src/shared/paths.js";
import { createInputFixture, createThreeChunkSegmenter } from "../helpers/cli-harness.js";
import { createTempDir } from "../helpers/temp-dir.js";

interface StdoutSpy {
  writes: number;
  restore: () => void;
}

function spyOnStdout(): StdoutSpy {
  const original = process.stdout.write.bind(process.stdout);
  const spy: StdoutSpy = {
    writes: 0,
    restore() {
      process.stdout.write = original;
    },
  };

  process.stdout.write = ((...args: unknown[]) => {
    spy.writes += 1;
    return (original as unknown as (...a: unknown[]) => boolean)(...args);
  }) as unknown as typeof process.stdout.write;

  return spy;
}

/**
 * Drives the transcribe pipeline exactly as the production handler composes it
 * (mapParamsToRequest -> stderr/buffer logger -> per-call binding thunk ->
 * runTranscriptionCore -> mapResultToToolOutput), but injects the offline
 * StubMediaSegmenter + a real FileJobStore so the round-trip stays offline-first
 * (no ffmpeg). Asserts process.stdout.write is never called during the handler.
 */
async function runTranscribeHandlerInProcess(params: TranscribeToolInput) {
  const infra = resolveInfra({ [MCP_PROVIDER_ENV_VAR]: "fake", FAKE_TRANSCRIBER_LATENCY_MS: "0" });
  const { logger, drain } = createStderrBufferLogger();
  const { request, chunkDurationMs }: { request: TranscriptionRequest; chunkDurationMs: number } =
    mapParamsToRequest(params);

  const spy = spyOnStdout();
  try {
    const result = await runTranscriptionCore({
      request,
      provider: infra.provider,
      chunkDurationMs,
      logger,
      createTranscriberBinding: createPerCallBindingThunk(infra, chunkDurationMs),
      createJobStore: (outputDir) => new FileJobStore(resolveJobPaths(outputDir)),
      createMediaSegmenter: () => createThreeChunkSegmenter(),
    });

    const output = mapResultToToolOutput(result, drain());
    return { output, result, stdoutWrites: spy.writes };
  } finally {
    spy.restore();
  }
}

describe("MCP transcribe handler (in-process, fake provider + stub segmenter)", () => {
  it("single input => transcript.md flat; structuredContent confere; 0 escritas em stdout", async () => {
    const root = await createTempDir("mcp-single");
    const outputDir = await createTempDir("mcp-single-out");
    const inputPath = await createInputFixture(root);

    const { output, result, stdoutWrites } = await runTranscribeHandlerInProcess({
      inputs: [inputPath],
      outputDir,
      chunkDurationSeconds: 60,
      concurrency: 2,
      fileConcurrency: 1,
      cleanupPolicy: "keep",
      resume: false,
    });

    expect(stdoutWrites).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(output.isError).toBeUndefined();

    // Flat layout: transcript.md at the bare outputDir; no batch-index.json.
    await stat(join(outputDir, "transcript.md"));
    await expect(stat(join(outputDir, "batch-index.json"))).rejects.toThrow();

    const structured = output.structuredContent as { exitCode: number; fileResults: BatchFileResult[] };
    expect(structured.exitCode).toBe(0);
    expect(structured.fileResults).toHaveLength(1);
    expect(structured.fileResults[0]!.subdir).toBeNull();
    expect(structured.fileResults[0]!.inputPath).toBe(inputPath);
  });

  it("multi input => subdirs + batch-index.json; structuredContent confere; 0 escritas em stdout", async () => {
    const root = await createTempDir("mcp-multi");
    const outputDir = await createTempDir("mcp-multi-out");
    const aAbs = await createInputFixture(await createTempDir("mcp-multi-a"));
    const bAbs = await createInputFixture(await createTempDir("mcp-multi-b"));

    const { output, result, stdoutWrites } = await runTranscribeHandlerInProcess({
      inputs: [aAbs, bAbs],
      outputDir,
      chunkDurationSeconds: 60,
      concurrency: 2,
      fileConcurrency: 2,
      cleanupPolicy: "keep",
      resume: false,
    });

    expect(stdoutWrites).toBe(0);
    expect(result.exitCode).toBe(0);

    const subdirA = deriveJobSubdir(aAbs);
    const subdirB = deriveJobSubdir(bAbs);
    await stat(join(outputDir, subdirA, "transcript.md"));
    await stat(join(outputDir, subdirB, "transcript.md"));

    const index = JSON.parse(await readFile(join(outputDir, "batch-index.json"), "utf8")) as {
      entries: Array<{ inputPath: string; subdir: string; exitCode: number }>;
    };
    expect(index.entries).toHaveLength(2);
    expect(index.entries.map((entry) => entry.inputPath)).toStrictEqual([aAbs, bAbs]);

    const structured = output.structuredContent as { exitCode: number; fileResults: BatchFileResult[] };
    expect(structured.exitCode).toBe(0);
    expect(structured.fileResults).toHaveLength(2);
    expect(structured.fileResults.map((file) => file.subdir)).toStrictEqual([subdirA, subdirB]);

    void root;
  });

  it("structuredContent espelha exatamente o resultado do core (exitCode + fileResults)", async () => {
    const root = await createTempDir("mcp-mirror");
    const outputDir = await createTempDir("mcp-mirror-out");
    const inputPath = await createInputFixture(root);

    const { output, result } = await runTranscribeHandlerInProcess({
      inputs: [inputPath],
      outputDir,
      chunkDurationSeconds: 60,
      concurrency: 2,
      fileConcurrency: 1,
      cleanupPolicy: "keep",
      resume: false,
    });

    expect(output.structuredContent).toStrictEqual({
      exitCode: result.exitCode,
      fileResults: result.fileResults,
    });
  });
});

describe("MCP server protocol surface (tools/list + health round-trip)", () => {
  async function connectClient(envOverrides: NodeJS.ProcessEnv = {}) {
    const infra = resolveInfra({
      [MCP_PROVIDER_ENV_VAR]: "fake",
      FAKE_TRANSCRIBER_LATENCY_MS: "0",
      ...envOverrides,
    });
    const server = createTranscriptionMcpServer({ infra });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    return { client, server };
  }

  it("publica transcribe sem provider/model/apiKey no inputSchema (GUARD R3)", async () => {
    const { client } = await connectClient();

    const { tools } = await client.listTools();
    const transcribe = tools.find((tool) => tool.name === "transcribe");

    expect(transcribe).toBeDefined();
    const properties = (transcribe!.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    const keys = Object.keys(properties);

    for (const forbidden of ["provider", "model", "apiKey", "backend", "endpoint", "language", "prompt"]) {
      expect(keys).not.toContain(forbidden);
    }

    expect(keys.sort()).toStrictEqual(
      ["chunkDurationSeconds", "cleanupPolicy", "concurrency", "fileConcurrency", "inputs", "outputDir", "resume"].sort(),
    );
  });

  it("com MCP_ALLOWED_ROOT, transcribe rejeita (isError) input fora da raiz antes de tocar o filesystem", async () => {
    const allowedRoot = await createTempDir("mcp-allowed-root");
    const { client } = await connectClient({ MCP_ALLOWED_ROOT: allowedRoot });

    const result = await client.callTool({
      name: "transcribe",
      arguments: {
        inputs: ["/etc/passwd"],
        outputDir: allowedRoot,
        chunkDurationSeconds: 60,
        concurrency: 1,
        fileConcurrency: 1,
        cleanupPolicy: "keep",
        resume: false,
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((part) => part.text)
      .join("\n");
    expect(text).toMatch(/MCP_ALLOWED_ROOT/);
  });

  it("transcription_health responde com provider/backend/ffmpeg sem expor secrets", async () => {
    const { client } = await connectClient();

    const result = await client.callTool({ name: "transcription_health", arguments: {} });
    const structured = result.structuredContent as Record<string, unknown>;

    expect(structured.provider).toBe("fake");
    expect(structured.ffmpegAvailable).toBe(true);
    expect(structured.ffprobeAvailable).toBe(true);
    expect(Object.keys(structured)).not.toContain("apiKey");
  });
});
