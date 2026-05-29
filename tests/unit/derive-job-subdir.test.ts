import { describe, expect, it } from "@jest/globals";

import { deriveJobSubdir } from "../../src/shared/paths.js";

describe("deriveJobSubdir", () => {
  it("is deterministic — same input yields identical output across calls", () => {
    const path = "/home/user/sessions/session1.mkv";
    expect(deriveJobSubdir(path)).toBe(deriveJobSubdir(path));
  });

  it("basename-collision resistance — /a/x.mkv vs /b/x.mkv produce different subdirs", () => {
    const a = deriveJobSubdir("/a/x.mkv");
    const b = deriveJobSubdir("/b/x.mkv");
    expect(a).not.toBe(b);
    // Both should start with the same slug 'x-' but differ in hash suffix
    expect(a.startsWith("x-")).toBe(true);
    expect(b.startsWith("x-")).toBe(true);
  });

  it("output matches /^[a-z0-9-]+-[0-9a-f]{8}$/ for a normal path", () => {
    const result = deriveJobSubdir("/sessions/my-session.mkv");
    expect(result).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}$/);
  });

  it("adversarial basename with slashes/backslashes/dots cannot escape the root", () => {
    const nastyPaths = [
      "/some/../../../etc/passwd.mkv",
      "/root/..\\evil.mp4",
      "/root/segment with spaces!@#$.wav",
      "/root/UPPERCASE_FILE.MKV",
    ];
    for (const p of nastyPaths) {
      const result = deriveJobSubdir(p);
      expect(result).toMatch(/^[a-z0-9][a-z0-9-]*-[0-9a-f]{8}$/);
      expect(result).not.toContain("/");
      expect(result).not.toContain("\\");
      expect(result).not.toContain("..");
    }
  });

  it("empty/blank sanitized basename falls back to 'input'", () => {
    // A basename that is all non-alphanumeric (except hyphens) chars will sanitize to empty
    // e.g. a file named "!!!" with no extension
    const result = deriveJobSubdir("/root/!!!");
    expect(result).toMatch(/^input-[0-9a-f]{8}$/);
  });

  it("hash is 8 hex characters long", () => {
    const result = deriveJobSubdir("/some/path/file.mkv");
    const parts = result.split("-");
    const hash = parts[parts.length - 1];
    expect(hash).toHaveLength(8);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});
