import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import console from "node:console";
import * as prettier from "prettier";
import { ESLint } from "eslint";
import { collectModuleSpecifiers } from "./architecture-check.mjs";
import { importViolation } from "./architecture-import-policy.mjs";
import { countPhysicalLines } from "./architecture-line-policy.mjs";

// Inventory and import checks never enumerate/read Employee Web source.
const base = "96b00c4e80bd394b398cee6b9f2b7148acdcd466";
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
  /^(apps\/valet-native\/|packages\/employee-client\/|docs\/validation\/GPS_C_IMPLEMENTATION_REPORT\.md$|scripts\/gps-c-validation\.mjs$|pnpm-lock\.yaml$)/;
const failures = inventory
  .filter((path) => !allowed.test(path))
  .map((path) => `Outside GPS-C ownership: ${path}`);
const roots = new Map(
  ["contracts", "database", "config", "ui", "testing", "employee-client"].map(
    (name) => [`@valet/${name}`, `packages/${name}`],
  ),
);
const code = inventory.filter(
  (path) => allowed.test(path) && /\.(ts|tsx|js|mjs|cjs)$/.test(path),
);
for (const path of code) {
  const source = readFileSync(path, "utf8");
  const lines = countPhysicalLines(source);
  if (lines > 300)
    failures.push(`${path}: ${lines} physical lines exceeds 300`);
  for (const specifier of collectModuleSpecifiers(source)) {
    const failure = importViolation(path, specifier, roots);
    if (failure !== undefined) failures.push(`${path}: ${failure}`);
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
    failures.push(`${path}: formatting differs`);
}
for (const path of [
  "apps/valet-native/src/shift/native-shift-start-panel.tsx",
  "apps/valet-native/src/shift/native-active-shift-panel.tsx",
]) {
  const before = git("show", `${base}:${path}`).replaceAll("\r\n", "\n");
  const after = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  const styleStart = before.indexOf("const stylesTheme");
  const marker =
    styleStart >= 0 ? "const stylesTheme" : "const nativeShiftStartStylesTheme";
  if (
    before.slice(before.indexOf(marker)) !== after.slice(after.indexOf(marker))
  )
    failures.push(`${path}: frozen geometry changed`);
}
for (const failure of failures) console.error(failure);
if (failures.length) process.exitCode = 1;
else {
  // Expo config plugins use CommonJS. Preserve the TS bar; permit only the
  // actual Expo SDK import in this one new plugin, with CommonJS globals.
  const eslint = new ESLint({
    overrideConfig: [
      {
        files: [
          "apps/valet-native/plugins/with-shift-presence-foreground-only.cjs",
        ],
        languageOptions: { sourceType: "commonjs" },
        rules: {
          "@typescript-eslint/no-require-imports": [
            "error",
            { allow: ["^expo/config-plugins$"] },
          ],
        },
      },
    ],
  });
  const lint = await eslint.lintFiles(code);
  if (lint.some((result) => result.errorCount || result.warningCount)) {
    console.error((await eslint.loadFormatter("stylish")).format(lint));
    process.exitCode = 1;
  } else {
    execFileSync("git", ["diff", "--check", base], { stdio: "inherit" });
    console.log(
      `GPS-C scoped structure/import/format/lint/diff/geometry passed: ${code.length} authored files, ${inventory.length} owned files.`,
    );
  }
}
