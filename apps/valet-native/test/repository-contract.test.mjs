import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(appRoot, "..", "..");

describe("Native repository contract", () => {
  it("has the minimal Router shell", () => {
    const layoutPath = resolve(appRoot, "app", "_layout.tsx");
    const indexPath = resolve(appRoot, "app", "index.tsx");

    expect(existsSync(layoutPath)).toBe(true);
    expect(existsSync(indexPath)).toBe(true);
    expect(readFileSync(layoutPath, "utf8")).toContain(
      '<Stack.Screen name="index"',
    );
    expect(readFileSync(indexPath, "utf8")).toContain("<FoundationShell />");
  });

  it.each(["android/build.gradle", "ios/Podfile"])(
    "keeps generated native path %s ignored",
    (generatedPath) => {
      expect(() =>
        execFileSync(
          "git",
          [
            "check-ignore",
            "--quiet",
            "--no-index",
            `apps/valet-native/${generatedPath}`,
          ],
          { cwd: repositoryRoot },
        ),
      ).not.toThrow();
    },
  );
});
