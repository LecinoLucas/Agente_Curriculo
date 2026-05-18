/**
 * R06 — Block imports from `src/legacy/`.
 *
 * ESLint is not configured in this project (build relies on `tsc --noEmit`).
 * To enforce the rule with minimal tooling cost we use a Vitest test that
 * walks the source tree and fails when any file OUTSIDE `src/legacy/` imports
 * from `legacy/`. The fix is to either:
 *
 *   1. Remove the offending import (preferred), or
 *   2. Move the imported code out of `src/legacy/` into `features/...`.
 *
 * Do NOT silence this test without an explicit PR explaining the reason.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const SRC_DIR = resolve(__dirname, "..");
const LEGACY_DIR = resolve(SRC_DIR, "legacy");

// Match import / re-export / dynamic import from any specifier that
// references `legacy/...` either as a path or via the `@/legacy` alias.
//
// Examples that MUST match:
//   import { Foo } from "@/legacy/candidate-drawer";
//   import { Foo } from "../legacy/candidate-drawer";
//   import { Foo } from "../../legacy/candidate-drawer/CandidateDrawer";
//   export * from "@/legacy/x";
//   const m = await import("@/legacy/x");
const LEGACY_IMPORT_RE =
  /(?:from|import)\s*\(?\s*["'](?:@\/legacy\/|(?:\.{1,2}\/)+legacy\/)[^"']*["']/;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

// Skip the guard file itself — its doc comments contain literal example
// imports that would otherwise self-trigger the rule.
const SELF_PATH = resolve(__filename);

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      // Skip the legacy dir itself — internal imports inside legacy/ are fine.
      if (resolve(full) === LEGACY_DIR) continue;
      // Skip dist, node_modules, etc. Defensive — they shouldn't be under src/.
      if (entry === "node_modules" || entry === "dist") continue;
      await walk(full, acc);
    } else {
      if (resolve(full) === SELF_PATH) continue;
      const dot = entry.lastIndexOf(".");
      if (dot >= 0 && SOURCE_EXTENSIONS.has(entry.slice(dot))) {
        acc.push(full);
      }
    }
  }
  return acc;
}

describe("R06 — legacy import guard", () => {
  it("no file outside src/legacy/ imports from legacy/", async () => {
    const files = await walk(SRC_DIR);
    const offenders: { file: string; line: string }[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        if (LEGACY_IMPORT_RE.test(line)) {
          offenders.push({
            file: relative(SRC_DIR, file),
            line: line.trim(),
          });
        }
      }
    }

    expect(
      offenders,
      `Files outside src/legacy/ must not import from legacy/.\n` +
        `Offenders:\n` +
        offenders.map((o) => `  ${o.file} :: ${o.line}`).join("\n"),
    ).toEqual([]);
  });
});
