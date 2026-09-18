import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const testFilePattern = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;
const dbSignalPattern =
  /(?:new\s+(?:(?:pg\.)?(?:Pool|Client))\s*\(|createRuntimePostgresPool\s*\(|CREATE\s+DATABASE|DROP\s+DATABASE)/i;
const raceSignalPattern =
  /(?:race|concurren|waitFor(?:Lock|Advisory)|pg_advisory|LOCK\s+TABLE|FOR\s+UPDATE|Promise\.all\s*\()/i;
const subprocessSignalPattern =
  /(?:node:child_process|runtime:provision|provision-runtime-role|migrate:deploy|run-migrate-deploy|raw-gps-cleanup)/i;
const compoundMarkers = new Set([
  "dashboard-api-test-context.ts",
  "payment-api-test-context.ts",
  "phase3-operations-gate-test-context.ts",
  "phase6-core-e2e-test-context.ts",
]);
const lazyPostgresOnlyTests = new Set([
  "postgres.test.ts",
  "shift-test-context-names.test.ts",
]);

export function classifyPackageTests({ packageKind, rootDir }) {
  const discovered = discoverTests(rootDir);
  const ownership = new Map();
  for (const file of discovered) {
    const relativeFile = normalize(relative(rootDir, file));
    if (/\.spec\.(?:[cm]?[jt]sx?)$/.test(file)) {
      throw new Error(
        `Unclassified test ${relativeFile}. Use the repository-owned *.test.ts convention so it enters exactly one test project.`,
      );
    }
    const graph = dependencyGraph(file, rootDir);
    const dbBacked =
      !lazyPostgresOnlyTests.has(relativeFile) &&
      graph.some((entry) => dbSignalPattern.test(entry.source));
    const project =
      packageKind === "api"
        ? classifyApi(file, graph, dbBacked)
        : classifyDatabase(graph, dbBacked);
    addOwnership(ownership, relativeFile, project);
  }
  assertExactlyOne(discovered, rootDir, ownership);
  return groupOwnership(ownership);
}

export function assertExecutableDatabaseAccessAllowed(projectName) {
  if (projectName.includes("non-postgres")) {
    throw new Error(
      `Real PostgreSQL access is forbidden from ${projectName}. ` +
        "Rename/restructure the test so the harness classifies it into a PostgreSQL project.",
    );
  }
}

export function discoverTests(rootDir) {
  const result = [];
  walk(rootDir, result);
  return result.sort();
}

function classifyApi(file, graph, dbBacked) {
  if (!dbBacked) return "api-non-postgres";
  const sourceText = graph.map((entry) => entry.source).join("\n");
  if (raceSignalPattern.test(`${file}\n${sourceText}`))
    return "api-postgres-race";
  if (graph.some((entry) => compoundMarkers.has(entry.basename))) {
    return "api-postgres-compound";
  }
  return "api-postgres-standard";
}

function classifyDatabase(graph, dbBacked) {
  if (!dbBacked) return "database-non-postgres";
  const sourceText = graph.map((entry) => entry.source).join("\n");
  return subprocessSignalPattern.test(sourceText)
    ? "database-postgres-provision"
    : "database-postgres-direct";
}

function dependencyGraph(entry, rootDir) {
  const visited = new Set();
  const result = [];
  const visit = (file) => {
    const normalized = resolve(file);
    if (visited.has(normalized) || !existsSync(normalized)) return;
    visited.add(normalized);
    const source = readFileSync(normalized, "utf8");
    result.push({ basename: normalized.split(/[\\/]/).at(-1), source });
    for (const specifier of localImportSpecifiers(source)) {
      const candidate = resolveImport(dirname(normalized), specifier);
      if (candidate === undefined || !isSupportFile(candidate, rootDir))
        continue;
      visit(candidate);
    }
  };
  visit(entry);
  return result;
}

function localImportSpecifiers(source) {
  const values = [];
  const expression =
    /(?:from\s+["'](\.[^"']+)["']|import\s*\(\s*["'](\.[^"']+)["']\s*\)|require\s*\(\s*["'](\.[^"']+)["']\s*\))/g;
  for (const match of source.matchAll(expression)) {
    values.push(match[1] ?? match[2] ?? match[3]);
  }
  return values;
}

function resolveImport(parent, specifier) {
  const raw = resolve(parent, specifier);
  const extension = extname(raw);
  const scriptExtensions = [
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
  ];
  const candidates = [raw];
  const sourceMappings = {
    ".cjs": [".cts"],
    ".js": [".ts", ".tsx"],
    ".jsx": [".tsx", ".ts"],
    ".mjs": [".mts", ".ts"],
  };
  for (const sourceExtension of sourceMappings[extension] ?? []) {
    candidates.unshift(raw.slice(0, -extension.length) + sourceExtension);
  }
  if (!existsSync(raw)) {
    candidates.push(
      ...scriptExtensions.map((suffix) => `${raw}${suffix}`),
      ...scriptExtensions.map((suffix) => join(raw, `index${suffix}`)),
    );
  }
  return candidates.find((candidate) => existsSync(candidate));
}

function isSupportFile(file, rootDir) {
  const rel = normalize(relative(rootDir, file));
  if (rel.startsWith("../")) return false;
  const name = file.split(/[\\/]/).at(-1) ?? "";
  return /(?:test|fixture|context|harness|helper|assertion|case)/i.test(name);
}

function addOwnership(ownership, file, project) {
  const existing = ownership.get(file);
  if (existing !== undefined) {
    throw new Error(
      `Test ${file} belongs to more than one project: ${existing}, ${project}.`,
    );
  }
  ownership.set(file, project);
}

function assertExactlyOne(discovered, rootDir, ownership) {
  if (discovered.length === 0)
    throw new Error(`No tests discovered under ${rootDir}.`);
  for (const file of discovered) {
    const rel = normalize(relative(rootDir, file));
    if (!ownership.has(rel))
      throw new Error(`Test ${rel} belongs to zero projects.`);
  }
}

function groupOwnership(ownership) {
  const projects = {};
  for (const [file, project] of ownership) {
    (projects[project] ??= []).push(file);
  }
  for (const files of Object.values(projects)) files.sort();
  return projects;
}

function walk(directory, result) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path, result);
    else if (testFilePattern.test(name)) result.push(path);
  }
}

function normalize(path) {
  return path.replaceAll("\\", "/");
}
