import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import console from "node:console";
import * as prettier from "prettier";
import { ESLint } from "eslint";
import { collectModuleSpecifiers } from "./architecture-check.mjs";
import { importViolation } from "./architecture-import-policy.mjs";
import { countPhysicalLines } from "./architecture-line-policy.mjs";

// Only changed, explicitly owned files are opened; no Employee Web traversal.
const base = "5e341361957c93ac8e9ae7dd99c9d361de2246a6";
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
  /^(\.env\.example$|apps\/dashboard\/src\/features\/administration\/settings\/(settings-page\.tsx|(?:shift-presence|use-presence|use-shift-presence|use-attendance-zone|attendance-zone)[^/]+)$|apps\/dashboard\/src\/features\/audit\/(audit-detail-values|audit-event-copy|audit-event-labels|audit-safe-details)\.ts$|apps\/dashboard\/e2e\/(?:shift-presence[^/]+|administration-settings-validation)\.spec\.ts$|apps\/dashboard\/e2e\/support\/presence-(data|fixtures|map-mock)\.ts$|docs\/(NATIVE_261_262_264_257_IMPLEMENTATION_PLAN\.md|design\/GPS_D_UI_PROTOTYPE_NOTES\.md|validation\/GPS_D_IMPLEMENTATION_REPORT\.md)$|scripts\/gps-d-validation\.mjs$)/;
const failures = inventory
  .filter((path) => !allowed.test(path))
  .map((path) => `Outside GPS-D ownership: ${path}`);
const roots = new Map(
  ["contracts", "database", "config", "ui", "testing", "employee-client"].map(
    (name) => [`@valet/${name}`, `packages/${name}`],
  ),
);
const code = inventory.filter(
  (path) => allowed.test(path) && /\.(ts|tsx|js|mjs)$/.test(path),
);
for (const path of code) {
  const source = readFileSync(path, "utf8");
  const lines = countPhysicalLines(source);
  console.log(`${lines}\t${path}`);
  if (lines > 300)
    failures.push(`${path}: ${lines} physical lines exceeds 300`);
  for (const specifier of collectModuleSpecifiers(source)) {
    const violation = importViolation(path, specifier, roots);
    if (violation !== undefined) failures.push(`${path}: ${violation}`);
    if (
      path.startsWith("apps/dashboard/") &&
      /(?:apps\/(?:api|valet)|@valet\/(?:database|employee-client))/.test(
        specifier,
      )
    )
      failures.push(
        `${path}: forbidden Dashboard implementation import ${specifier}`,
      );
  }
}
// Legacy settings panels and Dashboard shell/styles remain byte-identical.
for (const path of [
  "apps/dashboard/src/features/administration/settings/company-settings-panel.tsx",
  "apps/dashboard/src/features/administration/settings/management-location-settings-panel.tsx",
  "apps/dashboard/src/features/administration/settings/location-manager-settings-panel.tsx",
  "apps/dashboard/src/features/administration/administration.module.css",
  "apps/dashboard/src/components/foundation/selected-management-shell.tsx",
]) {
  const before = git("show", `${base}:${path}`).replaceAll("\r\n", "\n");
  if (before !== readFileSync(path, "utf8").replaceAll("\r\n", "\n"))
    failures.push(`${path}: frozen legacy source changed`);
}
for (const path of inventory.filter(
  (path) => allowed.test(path) && /\.(ts|tsx|js|mjs|css|md)$/.test(path),
)) {
  if (
    !(await prettier.check(readFileSync(path, "utf8"), {
      ...(await prettier.resolveConfig(path)),
      filepath: path,
    }))
  )
    failures.push(`${path}: formatting differs`);
}
const lint = await new ESLint().lintFiles(code);
if (lint.some((result) => result.errorCount || result.warningCount))
  failures.push((await new ESLint().loadFormatter("stylish")).format(lint));
execFileSync("git", ["diff", "--check", base], { stdio: "inherit" });
if (failures.length) {
  failures.forEach((failure) => console.error(failure));
  process.exitCode = 1;
} else
  console.log(
    `GPS-D scoped structure/import/format/lint/diff/frozen-source passed: ${code.length} authored files, ${inventory.length} owned files. Root scanner not invoked.`,
  );
