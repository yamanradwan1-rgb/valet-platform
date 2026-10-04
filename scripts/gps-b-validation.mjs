import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import * as prettier from "prettier";
import { collectModuleSpecifiers } from "./architecture-check.mjs";
import { importViolation } from "./architecture-import-policy.mjs";
import { countPhysicalLines } from "./architecture-line-policy.mjs";

// Scoped verification intentionally never reads Employee Web source.
const base = "168da01e6822049ee0a45eebec4780c5b2b1fbd9";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const inventory = [
  ...new Set(
    (
      git("diff", "--name-only", base) +
      git("ls-files", "--others", "--exclude-standard")
    )
      .trim()
      .split(/\r?\n/),
  ),
].filter(Boolean);
const allowed =
  /^(apps\/api\/|packages\/(contracts|database)\/|docs\/|scripts\/gps-b-validation\.mjs$)/;
const violations = inventory
  .filter((path) => !allowed.test(path))
  .map((path) => `Outside GPS-B ownership: ${path}`);
const packageRoots = new Map([
  ["@valet/contracts", "packages/contracts"],
  ["@valet/database", "packages/database"],
  ["@valet/config", "packages/config"],
  ["@valet/ui", "packages/ui"],
  ["@valet/testing", "packages/testing"],
  ["@valet/employee-client", "packages/employee-client"],
]);
const code = inventory.filter(
  (path) => allowed.test(path) && /\.(ts|tsx|js|mjs|cjs)$/.test(path),
);
for (const path of code) {
  const source = readFileSync(path, "utf8");
  const lines = countPhysicalLines(source);
  if (lines > 300) violations.push(`${path}: ${lines} lines exceeds 300`);
  for (const specifier of collectModuleSpecifiers(source)) {
    const failure = importViolation(path, specifier, packageRoots);
    if (failure !== undefined)
      violations.push(`${path}: ${specifier}: ${failure}`);
  }
}
for (const path of inventory.filter(
  (path) => allowed.test(path) && /\.(ts|tsx|js|mjs|cjs|json|md)$/.test(path),
)) {
  if (
    !(await prettier.check(readFileSync(path, "utf8"), {
      ...(await prettier.resolveConfig(path)),
      filepath: path,
    }))
  )
    violations.push(`${path}: formatting differs`);
}
for (const path of git(
  "ls-tree",
  "-r",
  "--name-only",
  base,
  "packages/database/prisma/migrations",
)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)) {
  if (
    readFileSync(path, "utf8").replaceAll("\r\n", "\n") !==
    git("show", `${base}:${path}`).replaceAll("\r\n", "\n")
  )
    violations.push(`${path}: historical migration changed`);
}
for (const failure of violations) console.error(failure);
if (violations.length > 0) process.exitCode = 1;
else {
  execFileSync(
    process.execPath,
    [resolve("node_modules/eslint/bin/eslint.js"), "--max-warnings=0", ...code],
    { stdio: "inherit" },
  );
  execFileSync("git", ["diff", "--check", base], { stdio: "inherit" });
  console.log(
    `GPS-B scoped structure/import/format/lint/diff checks passed: ${code.length} authored files; ${inventory.length} owned files; historical migrations unchanged.`,
  );
}
