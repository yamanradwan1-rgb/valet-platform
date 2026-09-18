import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  BASELINE_SOURCE_COMMIT,
  collectAuthoredFiles,
  countPhysicalLines,
  createGrandfatherEntries,
  evaluateLinePolicy,
  isAuthoredRepositoryPath,
  normalizeRepositoryPath,
  parseLineBaseline,
  TRANSITIONAL_PATHS,
  type LineBaseline,
} from "../../../scripts/architecture-line-policy.mjs";

const temporaryRoots: string[] = [];
const executeFile = promisify(execFile);

function baseline(
  grandfathered: Array<{ path: string; maxLines: number }> = [],
): LineBaseline {
  return {
    grandfathered,
    sourceCommit: BASELINE_SOURCE_COMMIT,
    version: 1,
  };
}

function content(lines: number, newline = "\n") {
  return Array.from({ length: lines }, () => "line").join(newline);
}

async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(resolve(tmpdir(), "valet-line-policy-"));
  temporaryRoots.push(root);
  await executeFile("git", ["init", "--quiet"], { cwd: root });
  for (const [path, value] of Object.entries(files)) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value);
  }
  return collectAuthoredFiles(root);
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("architecture physical-line policy", () => {
  it("accepts exactly 300 lines and rejects an ungrandfathered 301-line file", () => {
    const files = new Map([
      ["apps/exact.ts", content(300)],
      ["packages/oversized.ts", content(301)],
    ]);
    const result = evaluateLinePolicy(files, baseline());
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain(
      "NEW_OR_UNGRANDFATHERED_OVERSIZED_FILE",
    );
    expect(result.violations[0]).toContain("301 lines");
  });

  it("accepts a grandfathered file at max and rejects one line of growth", () => {
    const entry = { path: "apps/legacy.ts", maxLines: 350 };
    expect(
      evaluateLinePolicy(
        new Map([[entry.path, content(350)]]),
        baseline([entry]),
      ).violations,
    ).toEqual([]);
    expect(
      evaluateLinePolicy(
        new Map([[entry.path, content(351)]]),
        baseline([entry]),
      ).violations[0],
    ).toContain("GRANDFATHERED_FILE_GREW");
  });

  it("requires stale entries to be removed after shrink or deletion", () => {
    const entry = { path: "apps/legacy.ts", maxLines: 350 };
    expect(
      evaluateLinePolicy(
        new Map([[entry.path, content(300)]]),
        baseline([entry]),
      ).violations[0],
    ).toContain("STALE_GRANDFATHER_ENTRY");
    expect(
      evaluateLinePolicy(new Map(), baseline([entry])).violations[0],
    ).toContain("STALE_GRANDFATHER_ENTRY");
  });

  it("counts LF and CRLF equally without a trailing fake line", () => {
    expect(countPhysicalLines("")).toBe(0);
    expect(countPhysicalLines("a")).toBe(1);
    expect(countPhysicalLines("a\n")).toBe(1);
    expect(countPhysicalLines("a\nb\n")).toBe(2);
    expect(countPhysicalLines("a\r\nb\r\n")).toBe(2);
  });

  it("normalizes Windows and POSIX repository paths consistently", () => {
    expect(normalizeRepositoryPath("apps\\api\\..\\valet\\source.ts")).toBe(
      "apps/valet/source.ts",
    );
    expect(normalizeRepositoryPath("apps/api/../valet/source.ts")).toBe(
      "apps/valet/source.ts",
    );
  });

  it("excludes generated trees and includes normal authored roots", async () => {
    const files = await fixture({
      ".next/generated.ts": content(301),
      ".turbo/generated.mjs": content(301),
      "apps/api/source.ts": "export {};",
      "coverage/generated.js": content(301),
      "dist/generated.js": content(301),
      "node_modules/vendor.js": content(301),
      "packages/example/source.tsx": "export {};",
      "scripts/check.mjs": "export {};",
    });
    expect([...files.keys()]).toEqual([
      "apps/api/source.ts",
      "packages/example/source.tsx",
      "scripts/check.mjs",
    ]);
    expect(isAuthoredRepositoryPath("apps/api/source.ts")).toBe(true);
  });

  it("does not grandfather current-only files or VAL-004R transitional paths", () => {
    const baseFiles = new Map([["apps/base-legacy.ts", content(301)]]);
    for (const path of TRANSITIONAL_PATHS) {
      baseFiles.set(path, content(301));
    }
    const entries = createGrandfatherEntries(baseFiles);
    expect(entries).toEqual([{ maxLines: 301, path: "apps/base-legacy.ts" }]);
    expect(entries.some((entry) => entry.path === "apps/new-file.ts")).toBe(
      false,
    );
    const currentFiles = new Map(baseFiles);
    currentFiles.set("apps/new-file.ts", content(301));
    expect(
      evaluateLinePolicy(currentFiles, baseline(entries)).violations.join("\n"),
    ).toContain("apps/new-file.ts");
  });

  it("rejects unsupported baseline versions and source commits", () => {
    expect(() =>
      parseLineBaseline(
        JSON.stringify({
          grandfathered: [],
          sourceCommit: BASELINE_SOURCE_COMMIT,
          version: 2,
        }),
      ),
    ).toThrow("unsupported");
    expect(() =>
      parseLineBaseline(
        JSON.stringify({
          grandfathered: [],
          sourceCommit: "untrusted-current-tree",
          version: 1,
        }),
      ),
    ).toThrow("unsupported");
  });

  it("rejects malformed, unsorted, duplicate, escaping, and transitional entries", () => {
    const files = new Map([
      ["apps/a.ts", content(350)],
      ["apps/b.ts", content(350)],
    ]);
    const invalid = baseline([
      { path: "apps/b.ts", maxLines: 350 },
      { path: "apps/a.ts", maxLines: 350 },
      { path: "apps/a.ts", maxLines: 350 },
      { path: "../escape.ts", maxLines: 350 },
      { path: "apps\\wrong.ts", maxLines: 350 },
      { path: "apps/api/tools/provision-staff.ts", maxLines: 350 },
      { path: "apps/small.ts", maxLines: 300 },
    ]);
    const result = evaluateLinePolicy(files, invalid);
    expect(result.violations.join("\n")).toContain("not sorted");
    expect(result.violations.join("\n")).toContain("duplicate");
    expect(result.violations.join("\n")).toContain("not canonical");
    expect(result.violations.join("\n")).toContain("cannot be grandfathered");
    expect(result.violations.join("\n")).toContain("must exceed 300");
  });

  it("accepts the current repository after the transitional split", async () => {
    const repositoryRoot = resolve(__dirname, "../../..");
    const baselinePath = resolve(
      repositoryRoot,
      "scripts/architecture-line-baseline.json",
    );
    const [files, baselineContent] = await Promise.all([
      collectAuthoredFiles(repositoryRoot),
      readFile(baselinePath, "utf8"),
    ]);
    const result = evaluateLinePolicy(
      files,
      parseLineBaseline(baselineContent),
    );
    expect(result.violations).toEqual([]);
  });
});
