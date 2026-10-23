import { mkdir, mkdtemp, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkArchitecture } from "../../../scripts/architecture-check.mjs";
import {
  parseGitPathOutput,
  readRepositoryOwnedTextFiles,
  sameRepositoryRoot,
} from "../../../scripts/architecture-repository-files.mjs";
import {
  baseline,
  cleanupFixtures,
  content,
  GIT_FIXTURE_TIMEOUT_MS,
  runFixture,
  runFixtureGit,
  trackTemporaryRoot,
} from "./architecture-repository-fixture";

function gitTest(
  name: string,
  test: () => Promise<void>,
  timeout = GIT_FIXTURE_TIMEOUT_MS,
) {
  it(name, test, timeout);
}

afterEach(cleanupFixtures, 60_000);

describe("repository-owned authored file discovery", () => {
  gitTest("rejects an oversized tracked authored file", async () => {
    const path = "apps/example/tracked.ts";
    const result = await runFixture({
      files: { [path]: content(301) },
      tracked: [path],
    });
    expect(result.violations.join("\n")).toContain(`${path}: 301 lines`);
  });

  gitTest(
    "rejects an oversized untracked non-ignored file before git add",
    async () => {
      const path = "apps/example/untracked.ts";
      const result = await runFixture({ files: { [path]: content(301) } });
      expect(result.violations.join("\n")).toContain(`${path}: 301 lines`);
    },
  );

  gitTest(
    "excludes ignored files through standard Git info/exclude semantics",
    async () => {
      const result = await runFixture({
        files: {
          "local ignored.ts": content(301),
          "local/nested/ignored.js": content(301),
          "local/nested/ignored.tsx": content(301),
        },
        infoExclude: "/local ignored.ts\n/local/\n",
      });
      expect(result.violations).toEqual([]);
    },
  );

  gitTest("handles spaces with NUL-delimited Git discovery", async () => {
    const path = "apps/example/path with spaces.ts";
    const result = await runFixture({
      files: { [path]: content(301) },
      tracked: [path],
    });
    expect(result.violations.join("\n")).toContain(path);
  });

  gitTest(
    "preserves grandfather growth and stale-entry enforcement",
    async () => {
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
    },
    30_000,
  ); // Two independently built and inspected Git fixtures.

  gitTest(
    "skips a normal tracked deletion while retaining stale-baseline semantics",
    async () => {
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
    },
  );

  it("fails closed when an owned readable path disappears before reading", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "valet-owned-read-race-"));
    trackTemporaryRoot(root);
    const path = "apps/example/disappeared.ts";
    await expect(
      readRepositoryOwnedTextFiles(root, {
        deletedPaths: new Set(),
        paths: [path],
      }),
    ).rejects.toThrow(`cannot read ${path}`);
  });

  gitTest(
    "ignores generated Native projects but covers Native src",
    async () => {
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
    },
  );

  gitTest(
    "rejects generated Native project content if it becomes tracked",
    async () => {
      const path = "apps/valet-native/android/generated.ts";
      const result = await runFixture({
        files: { [path]: "export const generated = true;" },
        tracked: [path],
      });
      expect(result.violations.join("\n")).toContain(
        "generated Native project content must not be repository-owned",
      );
    },
  );

  gitTest("passes a clean tracked checkout", async () => {
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
    trackTemporaryRoot(root);
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

  gitTest("rejects a nested directory as the repository root", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "valet-nested-root-"));
    trackTemporaryRoot(root);
    await runFixtureGit(root, ["init", "--quiet"]);
    const nested = resolve(root, "nested");
    await mkdir(nested);
    const result = await checkArchitecture(nested, async () => new Map());
    expect(result.violations.join("\n")).toContain("expected Git root");
  });

  it("fails closed outside a Git repository", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "valet-no-git-"));
    trackTemporaryRoot(root);
    const result = await checkArchitecture(root, async () => new Map());
    expect(result.violations.join("\n")).toContain(
      "repository file discovery: Git command failed",
    );
  });
});
