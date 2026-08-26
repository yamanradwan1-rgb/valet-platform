import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Production-surface audit (D5-001).
 *
 * D1 shipped a shared FoundationPlaceholder component for routes whose
 * backend wiring had not arrived yet. Every production route is now a real
 * feature surface, so that component was deleted along with its orphaned
 * translation keys. This audit pins the resulting invariant so a placeholder
 * surface cannot silently ship again:
 *
 * 1. No production module references the retired placeholder component.
 * 2. No production source carries TODO/FIXME/"coming soon" markers.
 *
 * Test files (*.test.*) and their support modules are exempt: they may
 * legitimately mention these tokens when proving their absence.
 */

/** Directory containing this file: `apps/dashboard/src`. */
const SOURCE_ROOT = fileURLToPath(new URL(".", import.meta.url));

const PRODUCTION_EXTENSIONS = new Set([".ts", ".tsx"]);

function isProductionFile(fileName: string): boolean {
  if (!PRODUCTION_EXTENSIONS.has(fileName.slice(fileName.lastIndexOf(".")))) {
    return false;
  }
  return !fileName.includes(".test.") && !fileName.endsWith("-test-support.ts");
}

async function collectProductionFiles(
  directory: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [path, source] of await collectProductionFiles(entryPath)) {
        files.set(path, source);
      }
    } else if (entry.isFile() && isProductionFile(entry.name)) {
      files.set(entryPath, await readFile(entryPath, "utf8"));
    }
  }
  return files;
}

describe("production surface audit", () => {
  it("keeps the retired foundation placeholder surface deleted", async () => {
    for (const [path, source] of await collectProductionFiles(SOURCE_ROOT)) {
      expect(source.includes("FoundationPlaceholder"), path).toBe(false);
      expect(source.includes("foundation-placeholder"), path).toBe(false);
    }
  });

  it("carries no TODO/FIXME/coming-soon markers in production sources", async () => {
    const marker = /\b(?:TODO|FIXME)\b|coming soon/iu;
    for (const [path, source] of await collectProductionFiles(SOURCE_ROOT)) {
      expect(marker.test(source), path).toBe(false);
    }
  });

  it("announces sign-in failures assertively via role=alert", async () => {
    const source = await readFile(
      join(SOURCE_ROOT, "app", "(auth)", "sign-in", "page.tsx"),
      "utf8",
    );
    expect(source.includes('className="form-error" role="alert"')).toBe(true);
  });
});
