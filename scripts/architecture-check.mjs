import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { checkLinePolicy } from "./architecture-line-policy.mjs";

const SOURCE_DIRECTORY = ["apps", "api", "src"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const RETIRED_SYMBOLS = [
  "CheckInApiModule",
  "CHECK_IN_POSTGRES_POOL",
  "GuestCheckInController",
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
  const tokens = tokenizeModuleSyntax(source);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "identifier") {
      continue;
    }
    if (token.value === "import") {
      const specifier = importSpecifier(tokens, index + 1);
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    } else if (token.value === "export") {
      const specifier = exportSpecifier(tokens, index + 1);
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

function tokenizeModuleSyntax(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      index = skipLineComment(source, index + 2);
      continue;
    }
    if (character === "/" && next === "*") {
      index = skipBlockComment(source, index + 2);
      continue;
    }
    if (character === '"' || character === "'") {
      const stringToken = readStringToken(source, index, character);
      tokens.push({ kind: "string", value: stringToken.value });
      index = stringToken.end;
      continue;
    }
    if (character === "`") {
      index = skipTemplateLiteral(source, index + 1);
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) {
        index += 1;
      }
      tokens.push({ kind: "identifier", value: source.slice(start, index) });
      continue;
    }
    tokens.push({ kind: "punctuator", value: character });
    index += 1;
  }
  return tokens;
}

function skipLineComment(source, index) {
  while (index < source.length && source[index] !== "\n") {
    index += 1;
  }
  return index;
}

function skipBlockComment(source, index) {
  while (
    index < source.length &&
    !(source[index] === "*" && source[index + 1] === "/")
  ) {
    index += 1;
  }
  return Math.min(index + 2, source.length);
}

function skipTemplateLiteral(source, index) {
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
    } else if (source[index] === "`") {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return index;
}

function readStringToken(source, index, quote) {
  let value = "";
  index += 1;
  while (index < source.length) {
    const character = source[index];
    if (character === quote) {
      return { end: index + 1, value };
    }
    if (character === "\\" && index + 1 < source.length) {
      value += character + source[index + 1];
      index += 2;
    } else {
      value += character;
      index += 1;
    }
  }
  return { end: index, value };
}

function importSpecifier(tokens, start) {
  if (tokens[start]?.kind === "string") {
    return tokens[start].value;
  }
  if (tokens[start]?.value === "(") {
    return undefined;
  }

  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === "{" || token.value === "[" || token.value === "(") {
      depth += 1;
    } else if (
      token.value === "}" ||
      token.value === "]" ||
      token.value === ")"
    ) {
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

function exportSpecifier(tokens, start) {
  let index = start;
  if (tokens[index]?.value === "type") {
    index += 1;
  }
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
    if (tokens[index]?.value === "as") {
      index += 2;
    }
  } else {
    return undefined;
  }
  if (tokens[index]?.value === "from" && tokens[index + 1]?.kind === "string") {
    return tokens[index + 1].value;
  }
  return undefined;
}

export async function checkArchitecture(repositoryRoot, historicalLoader) {
  const sourceRoot = resolve(repositoryRoot, ...SOURCE_DIRECTORY);
  const files = await collectSourceFiles(sourceRoot);
  const violations = [];
  const warnings = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const repositoryPath = toRepositoryPath(repositoryRoot, filePath);
    const sourceArea = classifyArchitectureArea(repositoryPath);
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

  const linePolicy = await checkLinePolicy(
    repositoryRoot,
    resolve(repositoryRoot, "scripts", "architecture-line-baseline.json"),
    historicalLoader,
  );
  violations.push(...linePolicy.violations);
  warnings.push(...linePolicy.warnings);
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
