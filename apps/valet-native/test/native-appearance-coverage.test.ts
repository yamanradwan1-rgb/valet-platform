import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = path.resolve("src");
const fixedColors = new Set([
  "appearance/employee-palette.ts", // Only semantic source of theme colors.
  "employee-ui/employee-tokens.ts", // Immutable historical design constants.
  "guest-access/native-guest-access-qr.tsx", // QR black/white quiet zone.
]);
const literalTokenConsumers = new Set([
  "check-in/native-plate-roi-viewport.tsx", // White camera ROI + navy shadow.
  "check-in/native-check-in-styles.ts", // Legacy unused public re-export.
]);
function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? files(file)
      : /\.tsx?$/.test(file)
        ? [file]
        : [];
  });
}

describe("production Native appearance boundaries", () => {
  it("rejects direct hex/rgba colors and literal color imports outside explicit exceptions", () => {
    const violations: string[] = [];
    for (const file of files(root)) {
      const relative = path.relative(root, file).replaceAll("\\", "/");
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isStringLiteral(node) &&
          !fixedColors.has(relative) &&
          (/^#[\da-f]{3,8}$/i.test(node.text) || /^rgba?\(/.test(node.text))
        )
          violations.push(`${relative}:${node.text}`);
        if (
          ts.isImportSpecifier(node) &&
          /^(employeeColors|employeeStatusColors|checkInColors)$/.test(
            (node.propertyName ?? node.name).text,
          ) &&
          !literalTokenConsumers.has(relative)
        )
          violations.push(`${relative}:literal color import`);
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === "StyleSheet.create" &&
          ![
            "appearance/employee-themed-styles.ts",
            "check-in/native-plate-roi-viewport.tsx",
          ].includes(relative)
        )
          violations.push(`${relative}:unthemed sheet`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });
  it("keeps appearance dependencies out of business and identity lifecycle owners", () => {
    const names = [
      "auth/native-auth-runtime.ts",
      "shell/native-production-lifecycle-owner.ts",
      "shell/native-workflow-scope-retirement.ts",
      "shift/native-shift-retirement.ts",
      "shell/production-shell-controller.ts",
      "check-in/native-plate-camera-controller.ts",
    ];
    for (const name of names) {
      expect(fs.readFileSync(path.join(root, name), "utf8"), name).not.toMatch(
        /appearance|palette|theme/i,
      );
    }
    const provider = fs.readFileSync(
      path.join(root, "appearance/employee-appearance-context.tsx"),
      "utf8",
    );
    expect(provider).not.toMatch(
      /authGeneration|identityGeneration|organizationId|locationId|logout/,
    );
    const layout = fs.readFileSync(path.resolve("app/_layout.tsx"), "utf8");
    expect(layout).not.toMatch(/key=|createNativeAuth|createNativeRuntime/);
  });
});
