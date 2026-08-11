import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_DIRECTORY = ["apps", "api", "src"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const RETIRED_SYMBOLS = [
  "CheckInApiModule",
  "CHECK_IN_POSTGRES_POOL",
  "GuestCheckInController",
];
const LARGE_FILE_LINE_THRESHOLD = 450;

const IMPORT_PATTERNS = [
  /\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bexport\s+(?:[\s\S]*?\s+from\s+)["']([^"']+)["']/g,
];

function toRepositoryPath(repositoryRoot, targetPath) {
  return relative(repositoryRoot, targetPath).split(sep).join("/");
}

function normalizeSpecifier(specifier) {
  return specifier.replace(/[\\/]+/g, sep);
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith(".");
}

function classifyArchitectureArea(repositoryPath) {
  if (repositoryPath.startsWith("apps/api/src/common/")) {
    return "common";
  }
  if (repositoryPath.startsWith("apps/api/src/modules/anti-abuse/")) {
    return "anti-abuse";
  }
  if (repositoryPath.startsWith("apps/api/src/modules/auth/")) {
    return "auth";
  }
  if (repositoryPath.startsWith("apps/api/src/modules/guest-access/")) {
    return "guest-access";
  }
  if (repositoryPath.startsWith("apps/api/src/modules/check-in-api/")) {
    return "check-in";
  }
  if (repositoryPath.startsWith("apps/api/src/modules/")) {
    return "module";
  }
  return undefined;
}

function violationForEdge(sourceArea, targetArea) {
  if (sourceArea === "common" && targetArea !== "common") {
    return "common must not import application modules";
  }

  const forbiddenTargets = {
    "anti-abuse": new Set(["auth", "guest-access", "check-in"]),
    auth: new Set(["guest-access", "check-in"]),
    "guest-access": new Set(["check-in"]),
    "check-in": new Set(["guest-access", "anti-abuse"]),
  };

  if (forbiddenTargets[sourceArea]?.has(targetArea)) {
    return `${sourceArea} must not import ${targetArea}`;
  }
  return undefined;
}

export function collectModuleSpecifiers(source) {
  const specifiers = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) {
        specifiers.push(match[1]);
      }
    }
  }
  return specifiers;
}

export async function checkArchitecture(repositoryRoot) {
  const sourceRoot = resolve(repositoryRoot, ...SOURCE_DIRECTORY);
  const files = await collectSourceFiles(sourceRoot);
  const violations = [];
  const warnings = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const repositoryPath = toRepositoryPath(repositoryRoot, filePath);
    const sourceArea = classifyArchitectureArea(repositoryPath);
    const lineCount = source.split(/\r?\n/).length;

    if (lineCount > LARGE_FILE_LINE_THRESHOLD) {
      warnings.push(
        `${repositoryPath}: advisory: ${lineCount} lines exceeds ${LARGE_FILE_LINE_THRESHOLD}`,
      );
    }

    for (const symbol of RETIRED_SYMBOLS) {
      if (new RegExp(`\\b${symbol}\\b`).test(source)) {
        violations.push(
          `${repositoryPath}: retired architecture symbol ${symbol}`,
        );
      }
    }

    if (sourceArea === undefined) {
      continue;
    }

    for (const specifier of collectModuleSpecifiers(source)) {
      if (!isRelativeSpecifier(specifier)) {
        continue;
      }
      const targetPath = resolve(
        dirname(filePath),
        normalizeSpecifier(specifier),
      );
      const targetArea = classifyArchitectureArea(
        toRepositoryPath(repositoryRoot, targetPath),
      );
      const rule =
        targetArea === undefined
          ? undefined
          : violationForEdge(sourceArea, targetArea);
      if (rule !== undefined) {
        violations.push(`${repositoryPath}: ${specifier} violates ${rule}`);
      }
    }
  }

  return { violations: violations.sort(), warnings: warnings.sort() };
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extension(entry.name))) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function extension(fileName) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot === -1 ? "" : fileName.slice(lastDot);
}

async function main() {
  const rootOptionIndex = process.argv.indexOf("--root");
  const requestedRoot =
    rootOptionIndex === -1 ? undefined : process.argv[rootOptionIndex + 1];
  if (rootOptionIndex !== -1 && requestedRoot === undefined) {
    throw new Error("--root requires a repository path");
  }

  const repositoryRoot = resolve(
    requestedRoot ?? dirname(fileURLToPath(import.meta.url)),
    requestedRoot === undefined ? ".." : ".",
  );
  const { violations, warnings } = await checkArchitecture(repositoryRoot);
  for (const warning of warnings) {
    console.warn(`WARNING ${warning}`);
  }
  for (const violation of violations) {
    console.error(`ARCHITECTURE VIOLATION ${violation}`);
  }
  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
