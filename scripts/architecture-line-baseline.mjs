import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;
const GIT_READ_CONCURRENCY = 4;

async function runGit(execute, repositoryRoot, arguments_) {
  return execute("git", ["-C", repositoryRoot, ...arguments_], {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
}

export async function loadHistoricalBaselineFiles(
  repositoryRoot,
  sourceCommit,
  paths,
  execute = executeFile,
) {
  try {
    await runGit(execute, repositoryRoot, [
      "rev-parse",
      "--verify",
      "--quiet",
      `${sourceCommit}^{commit}`,
    ]);
  } catch {
    throw new Error("BASELINE_SOURCE_COMMIT_UNAVAILABLE");
  }

  const files = new Map();
  let nextIndex = 0;
  async function readNextPath() {
    while (nextIndex < paths.length) {
      const path = paths[nextIndex];
      nextIndex += 1;
      try {
        const { stdout } = await runGit(execute, repositoryRoot, [
          "show",
          `${sourceCommit}:${path}`,
        ]);
        files.set(path, stdout);
      } catch {
        files.set(path, undefined);
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(GIT_READ_CONCURRENCY, paths.length) },
      readNextPath,
    ),
  );
  return files;
}
