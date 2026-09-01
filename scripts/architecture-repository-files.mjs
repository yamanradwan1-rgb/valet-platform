import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, posix, resolve } from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

export const GENERATED_NATIVE_PREFIXES = [
  "apps/valet-native/android/",
  "apps/valet-native/ios/",
];

export function normalizeRepositoryPath(value) {
  return posix.normalize(value.replaceAll("\\", "/"));
}

export function isGeneratedNativePath(repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  return GENERATED_NATIVE_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

export async function collectRepositoryOwnedPaths(
  repositoryRoot,
  execute = executeFile,
) {
  const root = resolve(repositoryRoot);
  const topLevel = await runGit(execute, root, [
    "rev-parse",
    "--show-toplevel",
  ]);
  const decodedTopLevel = decodeUtf8(topLevel, "Git repository root").trimEnd();
  if (canonicalRoot(decodedTopLevel) !== canonicalRoot(root)) {
    throw new Error(
      `repository file discovery: expected Git root ${root}, found ${decodedTopLevel}`,
    );
  }

  const [ownedOutput, deletedOutput] = await Promise.all([
    runGit(execute, root, [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ]),
    runGit(execute, root, ["ls-files", "--deleted", "-z"]),
  ]);
  const paths = parseGitPathOutput(ownedOutput);
  const deletedPaths = new Set(parseGitPathOutput(deletedOutput));
  const ownedPaths = new Set(paths);
  for (const deletedPath of deletedPaths) {
    if (!ownedPaths.has(deletedPath)) {
      throw new Error(
        `repository file discovery: inconsistent tracked deletion ${deletedPath}`,
      );
    }
  }
  return { deletedPaths, paths };
}

export async function readRepositoryOwnedTextFiles(
  repositoryRoot,
  ownership,
  predicate = () => true,
) {
  const root = resolve(repositoryRoot);
  const files = new Map();
  for (const repositoryPath of ownership.paths) {
    if (ownership.deletedPaths.has(repositoryPath)) continue;
    if (!predicate(repositoryPath)) continue;
    try {
      files.set(
        repositoryPath,
        await readFile(resolve(root, repositoryPath), "utf8"),
      );
    } catch (error) {
      throw new Error(
        `repository file discovery: cannot read ${repositoryPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return files;
}

export function parseGitPathOutput(output) {
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output);
  if (bytes.length > 0 && bytes.at(-1) !== 0) {
    throw new Error(
      "repository file discovery: malformed NUL-delimited Git output",
    );
  }
  const paths = new Set();
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    const path = decodeUtf8(bytes.subarray(start, index), "Git path");
    start = index + 1;
    if (path.length === 0) {
      throw new Error("repository file discovery: Git returned an empty path");
    }
    const normalized = normalizeRepositoryPath(path);
    if (
      normalized !== path ||
      isAbsolute(path) ||
      /^[A-Za-z]:\//.test(path) ||
      normalized === ".." ||
      normalized.startsWith("../")
    ) {
      throw new Error(
        `repository file discovery: non-canonical repository path ${JSON.stringify(path)}`,
      );
    }
    paths.add(path);
  }
  return [...paths].sort(comparePaths);
}

async function runGit(execute, repositoryRoot, arguments_) {
  try {
    const { stdout } = await execute(
      "git",
      ["-C", repositoryRoot, ...arguments_],
      {
        encoding: "buffer",
        maxBuffer: GIT_MAX_BUFFER,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
    throw new Error(
      `repository file discovery: Git command failed (${arguments_.join(" ")}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function decodeUtf8(value, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new Error(`repository file discovery: ${label} is not valid UTF-8`);
  }
}

function canonicalRoot(value) {
  const normalized = resolve(value).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
