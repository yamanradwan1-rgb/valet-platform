import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { checkArchitecture } from "../../../scripts/architecture-check.mjs";
import { BASELINE_SOURCE_COMMIT } from "../../../scripts/architecture-line-policy.mjs";

const executeFile = promisify(execFile);
const temporaryRoots: string[] = [];
const pendingFixtures = new Set<Promise<unknown>>();

export const GIT_FIXTURE_TIMEOUT_MS = 20_000;

export function trackTemporaryRoot(root: string) {
  temporaryRoots.push(root);
}

export function runFixtureGit(root: string, args: string[]) {
  return executeFile("git", args, {
    cwd: root,
    timeout: 10_000,
    windowsHide: true,
  });
}

export function content(lines: number) {
  return Array.from({ length: lines }, () => "export const value = true;").join(
    "\n",
  );
}

export function baseline(
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

export async function runFixture(options: FixtureOptions) {
  const pending = createFixture(options);
  pendingFixtures.add(pending);
  try {
    return await pending;
  } finally {
    pendingFixtures.delete(pending);
  }
}

async function createFixture(options: FixtureOptions) {
  const root = await mkdtemp(resolve(tmpdir(), "valet-owned-files-"));
  trackTemporaryRoot(root);
  await runFixtureGit(root, ["init", "--quiet"]);
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
    await runFixtureGit(root, ["add", "--", ...options.tracked]);
  }
  if (options.commit === true) {
    await runFixtureGit(root, [
      "-c",
      "user.name=Architecture Fixture",
      "-c",
      "user.email=architecture-fixture@valet.test",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ]);
  }
  for (const path of options.deleteAfterAdd ?? []) {
    await rm(resolve(root, path));
  }
  return checkArchitecture(root, async () => new Map(options.historical ?? []));
}

export async function cleanupFixtures() {
  // Vitest timing out does not cancel Git. Let bounded children close before
  // removing their Windows directories, then retry transient EBUSY handles.
  await Promise.allSettled([...pendingFixtures]);
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, {
        force: true,
        recursive: true,
        maxRetries: 8,
        retryDelay: 125,
      }),
    ),
  );
}
