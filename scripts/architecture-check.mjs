import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importViolation } from "./architecture-import-policy.mjs";
import { tokenizeJavaScript } from "./architecture-js-tokenizer.mjs";
import {
  checkLinePolicy,
  isAuthoredRepositoryPath,
} from "./architecture-line-policy.mjs";
import { checkPortableGlobals } from "./architecture-portable-globals.mjs";
import {
  collectRepositoryOwnedPaths,
  isGeneratedNativePath,
  readRepositoryOwnedTextFiles,
} from "./architecture-repository-files.mjs";

const RETIRED_SYMBOLS = [
  "CheckInApiModule",
  "CHECK_IN_POSTGRES_POOL",
  "GuestCheckInController",
];

function isWorkspaceManifestPath(path) {
  return /^(apps|packages)\/[^/]+\/package\.json$/.test(path);
}

async function loadWorkspacePackageRoots(repositoryRoot, ownership) {
  const roots = new Map();
  const manifests = await readRepositoryOwnedTextFiles(
    repositoryRoot,
    ownership,
    isWorkspaceManifestPath,
  );
  for (const [manifestPath, content] of manifests) {
    let manifest;
    try {
      manifest = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `${manifestPath}: cannot parse workspace package identity: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (typeof manifest?.name !== "string" || manifest.name.length === 0) {
      throw new Error(`${manifestPath}: workspace package name is missing`);
    }
    if (roots.has(manifest.name)) {
      throw new Error(
        `${manifestPath}: duplicate workspace package ${manifest.name}`,
      );
    }
    roots.set(manifest.name, posix.dirname(manifestPath));
  }
  return roots;
}

export function collectModuleSpecifiers(source) {
  const specifiers = [];
  const tokens = tokenizeJavaScript(source);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "identifier") continue;
    if (token.value === "import") {
      const specifier = importSpecifier(tokens, index + 1);
      if (specifier !== undefined) specifiers.push(specifier);
    } else if (token.value === "export") {
      const specifier = exportSpecifier(tokens, index + 1);
      if (specifier !== undefined) specifiers.push(specifier);
    } else if (token.value === "require") {
      const specifier = callSpecifier(tokens, index + 1);
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

function importSpecifier(tokens, start) {
  if (tokens[start]?.kind === "string") return tokens[start].value;
  if (tokens[start]?.value === "(") return callSpecifier(tokens, start);
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === "{" || token.value === "[" || token.value === "(") {
      depth += 1;
    } else if (["}", "]", ")"].includes(token.value)) {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && token.value === ";") {
      return undefined;
    } else if (
      depth === 0 &&
      token.kind === "identifier" &&
      token.value === "from" &&
      tokens[index + 1]?.kind === "string"
    ) {
      return tokens[index + 1].value;
    }
  }
  return undefined;
}

function callSpecifier(tokens, start) {
  return tokens[start]?.value === "(" && tokens[start + 1]?.kind === "string"
    ? tokens[start + 1].value
    : undefined;
}

function exportSpecifier(tokens, start) {
  let index = start;
  if (tokens[index]?.value === "type") index += 1;
  if (tokens[index]?.value === "{") {
    let depth = 1;
    index += 1;
    while (index < tokens.length && depth > 0) {
      if (tokens[index].value === "{") depth += 1;
      if (tokens[index].value === "}") depth -= 1;
      index += 1;
    }
  } else if (tokens[index]?.value === "*") {
    index += 1;
    if (tokens[index]?.value === "as") index += 2;
  } else {
    return undefined;
  }
  return tokens[index]?.value === "from" && tokens[index + 1]?.kind === "string"
    ? tokens[index + 1].value
    : undefined;
}

export async function checkArchitecture(repositoryRoot, historicalLoader) {
  const violations = [];
  const warnings = [];
  try {
    const ownership = await collectRepositoryOwnedPaths(repositoryRoot);
    const workspacePackageRoots = await loadWorkspacePackageRoots(
      repositoryRoot,
      ownership,
    );
    const authoredFiles = await readRepositoryOwnedTextFiles(
      repositoryRoot,
      ownership,
      isAuthoredRepositoryPath,
    );
    violations.push(
      ...checkGeneratedNativeOwnership(ownership.paths),
      ...checkImportBoundaries(authoredFiles, workspacePackageRoots),
      ...checkPortableGlobals(authoredFiles),
      ...checkRetiredSymbols(authoredFiles),
    );
    const linePolicy = await checkLinePolicy(
      repositoryRoot,
      resolve(repositoryRoot, "scripts", "architecture-line-baseline.json"),
      historicalLoader,
      authoredFiles,
    );
    violations.push(...linePolicy.violations);
    warnings.push(...linePolicy.warnings);
  } catch (error) {
    violations.push(error instanceof Error ? error.message : String(error));
  }
  return { violations: violations.sort(), warnings: warnings.sort() };
}

function checkGeneratedNativeOwnership(repositoryPaths) {
  return repositoryPaths
    .filter(isGeneratedNativePath)
    .map(
      (path) =>
        `${path}: generated Native project content must not be repository-owned`,
    );
}

function checkImportBoundaries(files, workspacePackageRoots) {
  const violations = [];
  for (const [sourcePath, source] of files) {
    let specifiers;
    try {
      specifiers = collectModuleSpecifiers(source);
    } catch (error) {
      violations.push(
        `${sourcePath}: cannot inspect module specifiers: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    for (const specifier of specifiers) {
      const rule = importViolation(
        sourcePath,
        specifier,
        workspacePackageRoots,
      );
      if (rule !== undefined) {
        violations.push(`${sourcePath}: ${specifier} violates ${rule}`);
      }
    }
  }
  return violations;
}

function checkRetiredSymbols(files) {
  const violations = [];
  for (const [path, source] of files) {
    if (!/^apps\/api\/src\/.*\.tsx?$/.test(path)) continue;
    for (const symbol of RETIRED_SYMBOLS) {
      if (new RegExp(`\\b${symbol}\\b`).test(source)) {
        violations.push(`${path}: retired architecture symbol ${symbol}`);
      }
    }
  }
  return violations;
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
  for (const warning of warnings) console.warn(`WARNING ${warning}`);
  for (const violation of violations) {
    console.error(`ARCHITECTURE VIOLATION ${violation}`);
  }
  if (violations.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
