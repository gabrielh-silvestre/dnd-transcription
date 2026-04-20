import { describe, expect, it } from "@jest/globals";
import { setTimeout as delay } from "node:timers/promises";

import { runTaskPool } from "../../src/infrastructure/concurrency/task-pool.js";

describe("Task pool", () => {
  it("respeita o limite de concorrencia configurado", async () => {
    let active = 0;
    let maxActive = 0;

    await runTaskPool({
      items: [1, 2, 3, 4, 5],
      concurrency: 2,
      worker: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(20);
        active -= 1;
      },
    });

    expect(maxActive).toBe(2);
  });
});
