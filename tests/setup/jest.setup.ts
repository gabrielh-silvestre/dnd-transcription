import { afterEach } from "@jest/globals";

import { cleanupTempDirs } from "../helpers/temp-dir.js";

afterEach(async () => {
  await cleanupTempDirs();
});
