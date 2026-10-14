import { resolve } from "node:path";

import { runHarnessCommand } from "./command-runner.mjs";
import { acquireInvocationLease } from "./invocation-lease.mjs";
import { classifyPackageTests } from "./test-classification.mjs";

const [packageKind, config, ...requested] = process.argv.slice(2);
if (!packageKind || !config || requested.length === 0) {
  throw new Error(
    "Usage: run-owned-tests.mjs <api|database> <config> <test-file> [test-file...].",
  );
}
const sourcePrefix = packageKind === "api" ? "test" : "src";
const rootDir = resolve(process.cwd(), sourcePrefix);
const ownership = classifyPackageTests({ packageKind, rootDir });
const normalized = requested.map((file) => file.replaceAll("\\", "/"));
const groups = new Map();

for (const file of normalized) {
  const relativeFile = file.startsWith(`${sourcePrefix}/`)
    ? file.slice(sourcePrefix.length + 1)
    : file;
  const matches = Object.entries(ownership).filter(([, files]) =>
    files.includes(relativeFile),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Requested test ${file} belongs to ${matches.length} projects.`,
    );
  }
  const [project] = matches[0];
  const list = groups.get(project) ?? [];
  list.push(`${sourcePrefix}/${relativeFile}`);
  groups.set(project, list);
}

let failed = false;
const needsPostgres = [...groups.keys()].some((project) =>
  !project.endsWith("-non-postgres"),
);
const lease = needsPostgres
  ? await acquireInvocationLease(`focused-${packageKind}`, {
      selectedProjects: [...groups.keys()],
    })
  : { cleanup: async () => {}, release: async () => {} };
try {
  for (const [project, files] of groups) {
    try {
      const result = await runHarnessCommand(
        [
          "exec",
          "vitest",
          "run",
          "--config",
          config,
          "--project",
          project,
          ...files,
        ],
        { label: `${project}:${files.join(",")}` },
      );
      if (result.code !== 0) failed = true;
    } finally {
      if (!project.endsWith("-non-postgres")) await lease.cleanup();
    }
  }
} finally {
  await lease.release();
}
if (failed) process.exitCode = 1;
