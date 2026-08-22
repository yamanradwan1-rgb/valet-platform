import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";

import { loadHistoricalBaselineFiles } from "./architecture-line-baseline.mjs";

export const AUTHORED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
]);
export const BASELINE_SOURCE_COMMIT =
  "1b5db989252dbf8d47b9fe7f81e55a96ed012c56";
export const LINE_LIMIT = 300;
export const TRANSITIONAL_PATHS = new Set([
  "apps/api/test/provision-staff.integration.test.ts",
  "apps/api/test/provision-staff.test.ts",
  "apps/api/tools/provision-staff.ts",
]);

const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "reference",
]);

export function countPhysicalLines(content) {
  if (content.length === 0) return 0;
  const lines = content.split(/\r\n|\n/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

export function normalizeRepositoryPath(value) {
  return posix.normalize(value.replaceAll("\\", "/"));
}

export function isExcludedRepositoryPath(repositoryPath) {
  return normalizeRepositoryPath(repositoryPath)
    .split("/")
    .some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

export function isAuthoredRepositoryPath(repositoryPath) {
  if (isExcludedRepositoryPath(repositoryPath)) return false;
  const normalized = normalizeRepositoryPath(repositoryPath);
  const lastDot = normalized.lastIndexOf(".");
  const extension =
    lastDot === -1 ? "" : normalized.slice(lastDot).toLowerCase();
  return AUTHORED_EXTENSIONS.has(extension);
}

export async function collectAuthoredFiles(repositoryRoot) {
  const files = new Map();
  await collectDirectory(repositoryRoot, repositoryRoot, files);
  return new Map(
    [...files].sort(([left], [right]) => comparePaths(left, right)),
  );
}

async function collectDirectory(repositoryRoot, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) =>
    comparePaths(left.name, right.name),
  )) {
    const entryPath = resolve(directory, entry.name);
    const repositoryPath = normalizeRepositoryPath(
      relative(repositoryRoot, entryPath).split(sep).join("/"),
    );
    if (isExcludedRepositoryPath(repositoryPath)) continue;
    if (entry.isDirectory()) {
      await collectDirectory(repositoryRoot, entryPath, files);
    } else if (entry.isFile() && isAuthoredRepositoryPath(repositoryPath)) {
      files.set(repositoryPath, await readFile(entryPath, "utf8"));
    }
  }
}

export function parseLineBaseline(content) {
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("line baseline is not valid JSON");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    value.version !== 1 ||
    value.sourceCommit !== BASELINE_SOURCE_COMMIT ||
    !Array.isArray(value.grandfathered)
  ) {
    throw new Error("line baseline has an unsupported shape or version");
  }
  return value;
}

export function evaluateLinePolicy(files, baseline) {
  const violations = [];
  const warnings = [];
  const baselineByPath = new Map();
  const seenPaths = new Set();
  let previousPath;

  for (const entry of baseline.grandfathered) {
    const reason = invalidBaselineEntry(entry, previousPath, seenPaths);
    if (typeof entry?.path === "string") {
      seenPaths.add(entry.path);
      previousPath = entry.path;
    }
    if (reason !== undefined) {
      violations.push(`line baseline: ${reason}`);
      continue;
    }
    baselineByPath.set(entry.path, entry.maxLines);
  }

  for (const [path, maximum] of baselineByPath) {
    const content = files.get(path);
    if (content === undefined) {
      violations.push(
        lineViolation(path, 0, "STALE_GRANDFATHER_ENTRY", maximum),
      );
      continue;
    }
    const current = countPhysicalLines(content);
    if (current <= LINE_LIMIT) {
      violations.push(
        lineViolation(path, current, "STALE_GRANDFATHER_ENTRY", maximum),
      );
    } else if (current > maximum) {
      violations.push(
        lineViolation(path, current, "GRANDFATHERED_FILE_GREW", maximum),
      );
    } else {
      warnings.push(
        `${path}: grandfathered ${current} lines (limit ${LINE_LIMIT}, baseline maximum ${maximum})`,
      );
    }
  }

  for (const [path, content] of files) {
    const current = countPhysicalLines(content);
    if (current > LINE_LIMIT && !baselineByPath.has(path)) {
      violations.push(
        lineViolation(path, current, "NEW_OR_UNGRANDFATHERED_OVERSIZED_FILE"),
      );
    }
  }
  return { violations: violations.sort(), warnings: warnings.sort() };
}

export function evaluateHistoricalBaseline(baseline, historicalFiles) {
  const violations = [];
  const { baselineByPath, structuralViolations } = validateBaselineEntries(
    baseline.grandfathered,
  );
  violations.push(...structuralViolations);
  for (const [path, maximum] of baselineByPath) {
    const content = historicalFiles.get(path);
    if (content === undefined) {
      violations.push(
        `line baseline: ${path}: BASELINE_PATH_NOT_IN_SOURCE_COMMIT`,
      );
      continue;
    }
    const historical = countPhysicalLines(content);
    if (historical <= LINE_LIMIT || historical !== maximum) {
      violations.push(
        `line baseline: ${path}: historical ${historical} lines, recorded maximum ${maximum}: BASELINE_LINE_COUNT_MISMATCH`,
      );
    }
  }
  return violations.sort();
}

function validateBaselineEntries(entries) {
  const baselineByPath = new Map();
  const structuralViolations = [];
  const seenPaths = new Set();
  let previousPath;
  for (const entry of entries) {
    const reason = invalidBaselineEntry(entry, previousPath, seenPaths);
    if (typeof entry?.path === "string") {
      seenPaths.add(entry.path);
      previousPath = entry.path;
    }
    if (reason === undefined) baselineByPath.set(entry.path, entry.maxLines);
    else structuralViolations.push(`line baseline: ${reason}`);
  }
  return { baselineByPath, structuralViolations };
}

function invalidBaselineEntry(entry, previousPath, seenPaths) {
  if (
    entry === null ||
    typeof entry !== "object" ||
    typeof entry.path !== "string" ||
    !Number.isInteger(entry.maxLines)
  ) {
    return "entry has an invalid shape";
  }
  const normalized = normalizeRepositoryPath(entry.path);
  if (
    entry.path !== normalized ||
    isAbsolute(entry.path) ||
    /^[A-Za-z]:\//.test(entry.path) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return `${entry.path}: path is not canonical repository-relative form`;
  }
  if (!isAuthoredRepositoryPath(entry.path)) {
    return `${entry.path}: path is not covered authored code`;
  }
  if (entry.maxLines <= LINE_LIMIT) {
    return `${entry.path}: baseline maximum must exceed ${LINE_LIMIT}`;
  }
  if (TRANSITIONAL_PATHS.has(entry.path)) {
    return `${entry.path}: transitional VAL-004R path cannot be grandfathered`;
  }
  if (seenPaths.has(entry.path)) {
    return `${entry.path}: duplicate path`;
  }
  if (
    previousPath !== undefined &&
    comparePaths(previousPath, entry.path) >= 0
  ) {
    return `${entry.path}: entries are not sorted lexicographically`;
  }
  return undefined;
}

function lineViolation(path, current, reason, maximum) {
  const baseline = maximum === undefined ? "" : `, baseline maximum ${maximum}`;
  return `${path}: ${current} lines, limit ${LINE_LIMIT}${baseline}: ${reason}`;
}

export function createGrandfatherEntries(baseFiles) {
  return [...baseFiles]
    .filter(
      ([path, content]) =>
        !TRANSITIONAL_PATHS.has(path) &&
        countPhysicalLines(content) > LINE_LIMIT,
    )
    .map(([path, content]) => ({
      maxLines: countPhysicalLines(content),
      path: normalizeRepositoryPath(path),
    }))
    .sort((left, right) => comparePaths(left.path, right.path));
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function checkLinePolicy(
  repositoryRoot,
  baselinePath,
  historicalLoader = loadHistoricalBaselineFiles,
) {
  try {
    const [files, baselineContent] = await Promise.all([
      collectAuthoredFiles(repositoryRoot),
      readFile(baselinePath, "utf8"),
    ]);
    const baseline = parseLineBaseline(baselineContent);
    const currentResult = evaluateLinePolicy(files, baseline);
    const paths = baseline.grandfathered
      .map((entry) => entry?.path)
      .filter((path) => typeof path === "string");
    const historicalFiles = await historicalLoader(
      repositoryRoot,
      baseline.sourceCommit,
      paths,
    );
    return {
      violations: [
        ...currentResult.violations,
        ...evaluateHistoricalBaseline(baseline, historicalFiles),
      ].sort(),
      warnings: currentResult.warnings,
    };
  } catch (error) {
    return {
      violations: [
        `line baseline: ${error instanceof Error ? error.message : String(error)}`,
      ],
      warnings: [],
    };
  }
}
