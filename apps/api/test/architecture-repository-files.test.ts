import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { checkArchitecture } from "../../../scripts/architecture-check.mjs";
import { BASELINE_SOURCE_COMMIT } from "../../../scripts/architecture-line-policy.mjs";
import {
  parseGitPathOutput,
  readRepositoryOwnedTextFiles,
  sameRepositoryRoot,
} from "../../../scripts/architecture-repository-files.mjs";

const executeFile = promisify(execFile);
const temporaryRoots: string[] = [];

function content(lines: number) {
  return Array.from({ length: lines }, () => "export const value = true;").join(
    "\n",
  );
}

function baseline(
  grandfathered: Array<{ maxLines: number; path: string }> = [],
) {
  return JSON.stringify({
    grandfathered,
    sourceCommit: BASELINE_SOURCE_COMMIT,
    version: 1,
  });
}

interface FixtureOptions {
  readonly commit?: boolean;
  readonly deleteAfterAdd?: string[];
  readonly files: Record<string, string>;
  readonly historical?: ReadonlyMap<string, string | undefined>;
  readonly infoExclude?: string;
  readonly tracked?: string[];
}

async function runFixture(options: FixtureOptions) {
  const root = await mkdtemp(resolve(tmpdir(), "valet-owned-files-"));
  temporaryRoots.push(root);
  await executeFile("git", ["init", "--quiet"], { cwd: root });
  if (options.infoExclude !== undefined) {
    await writeFile(resolve(root, ".git/info/exclude"), options.infoExclude);
  }
  const files = {
    "scripts/architecture-line-baseline.json": baseline(),
    ...options.files,
  };
  for (const [path, value] of Object.entries(files)) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value);
  }
  if (options.tracked !== undefined) {
    await executeFile("git", ["add", "--", ...options.tracked], { cwd: root });
  }
  if (options.commit === true) {
    await executeFile(
      "git",
      [
        "-c",
        "user.name=Architecture Fixture",
        "-c",
        "user.email=architecture-fixture@valet.test",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      ],
      { cwd: root },
    );
  }
  for (const path of options.deleteAfterAdd ?? []) {
    await rm(resolve(root, path));
  }
  return checkArchitecture(root, async () => new Map(options.historical ?? []));
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("repository-owned authored file discovery", () => {
  it("rejects an oversized tracked authored file", async () => {
    const path = "apps/example/tracked.ts";
    const result = await runFixture({
      files: { [path]: content(301) },
      tracked: [path],
    });
    expect(result.violations.join("\n")).toContain(`${path}: 301 lines`);
  });

  it("rejects an oversized untracked non-ignored file before git add", async () => {
    const path = "apps/example/untracked.ts";
    const result = await runFixture({ files: { [path]: content(301) } });
    expect(result.violations.join("\n")).toContain(`${path}: 301 lines`);
  });

  it("excludes ignored files through standard Git info/exclude semantics", async () => {
    const result = await runFixture({
      files: {
        "local ignored.ts": content(301),
        "local/nested/ignored.js": content(301),
        "local/nested/ignored.tsx": content(301),
      },
      infoExclude: "/local ignored.ts\n/local/\n",
    });
    expect(result.violations).toEqual([]);
  });

  it("handles spaces with NUL-delimited Git discovery", async () => {
    const path = "apps/example/path with spaces.ts";
    const result = await runFixture({
      files: { [path]: content(301) },
      tracked: [path],
    });
    expect(result.violations.join("\n")).toContain(path);
  });

  it("preserves grandfather growth and stale-entry enforcement", async () => {
    const path = "apps/example/legacy.ts";
    const entry = [{ maxLines: 350, path }];
    const historical = new Map([[path, content(350)]]);
    const grown = await runFixture({
      files: {
        [path]: content(351),
        "scripts/architecture-line-baseline.json": baseline(entry),
      },
      historical,
      tracked: [path],
    });
    expect(grown.violations.join("\n")).toContain("GRANDFATHERED_FILE_GREW");

    const shrunk = await runFixture({
      files: {
        [path]: content(300),
        "scripts/architecture-line-baseline.json": baseline(entry),
      },
      historical,
      tracked: [path],
    });
    expect(shrunk.violations.join("\n")).toContain("STALE_GRANDFATHER_ENTRY");
  });

  it("skips a normal tracked deletion while retaining stale-baseline semantics", async () => {
    const path = "apps/example/deleted.ts";
    const entry = [{ maxLines: 350, path }];
    const result = await runFixture({
      deleteAfterAdd: [path],
      files: {
        [path]: content(350),
        "scripts/architecture-line-baseline.json": baseline(entry),
      },
      historical: new Map([[path, content(350)]]),
      tracked: [path],
    });
    expect(result.violations.join("\n")).toContain("STALE_GRANDFATHER_ENTRY");
    expect(result.violations.join("\n")).not.toContain("cannot read");
  });

  it("fails closed when an owned readable path disappears before reading", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "valet-owned-read-race-"));
    temporaryRoots.push(root);
    const path = "apps/example/disappeared.ts";
    await expect(
      readRepositoryOwnedTextFiles(root, {
        deletedPaths: new Set(),
        paths: [path],
      }),
    ).rejects.toThrow(`cannot read ${path}`);
  });

  it("ignores generated Native projects but covers Native src", async () => {
    const result = await runFixture({
      files: {
        ".gitignore": "apps/valet-native/android/\napps/valet-native/ios/\n",
        "apps/valet-native/android/generated.ts": content(301),
        "apps/valet-native/ios/generated.js": content(301),
        "apps/valet-native/src/owned.ts": content(301),
      },
    });
    expect(result.violations.join("\n")).toContain(
      "apps/valet-native/src/owned.ts",
    );
    expect(result.violations.join("\n")).not.toContain("/android/");
    expect(result.violations.join("\n")).not.toContain("/ios/");
  });

  it("rejects generated Native project content if it becomes tracked", async () => {
    const path = "apps/valet-native/android/generated.ts";
    const result = await runFixture({
      files: { [path]: "export const generated = true;" },
      tracked: [path],
    });
    expect(result.violations.join("\n")).toContain(
      "generated Native project content must not be repository-owned",
    );
  });

  it("passes a clean tracked checkout", async () => {
    const path = "apps/example/source.ts";
    const result = await runFixture({
      commit: true,
      files: { [path]: "export const value = true;" },
      tracked: [path, "scripts/architecture-line-baseline.json"],
    });
    expect(result.violations).toEqual([]);
  });

  it("compares repository roots by filesystem identity", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "valet root identity-"));
    temporaryRoots.push(root);
    const nested = resolve(root, "nested");
    await mkdir(nested);
    expect(await sameRepositoryRoot(root, root.replaceAll("\\", "/"))).toBe(
      true,
    );
    expect(await sameRepositoryRoot(root, nested)).toBe(false);
    if (process.platform === "win32") {
      const driveCase = `${root[0]!.toLowerCase()}${root.slice(1)}`;
      expect(await sameRepositoryRoot(root, driveCase)).toBe(true);
      expect(await sameRepositoryRoot(root, `\\\\?\\${root}`)).toBe(true);
    }
    const alias = `${root}-alias`;
    await symlink(
      root,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    try {
      expect(await sameRepositoryRoot(root, alias)).toBe(true);
    } finally {
      await unlink(alias);
    }
  });

  it("keeps Git-relative traversal outside repository ownership", () => {
    expect(() => parseGitPathOutput(Buffer.from("../escape.ts\0"))).toThrow(
      "non-canonical repository path",
    );
  });

  it("rejects a nested directory as the repository root", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "valet-nested-root-"));
    temporaryRoots.push(root);
    await executeFile("git", ["init", "--quiet"], { cwd: root });
    const nested = resolve(root, "nested");
    await mkdir(nested);
    const result = await checkArchitecture(nested, async () => new Map());
    expect(result.violations.join("\n")).toContain("expected Git root");
  });

  it("fails closed outside a Git repository", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "valet-no-git-"));
    temporaryRoots.push(root);
    const result = await checkArchitecture(root, async () => new Map());
    expect(result.violations.join("\n")).toContain(
      "repository file discovery: Git command failed",
    );
  });
});
