import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(appRoot, "..", "..");

describe("Native repository contract", () => {
  it("has the production Router shell", () => {
    const layoutPath = resolve(appRoot, "app", "_layout.tsx");
    const indexPath = resolve(appRoot, "app", "index.tsx");

    expect(existsSync(layoutPath)).toBe(true);
    expect(existsSync(indexPath)).toBe(true);
    expect(readFileSync(layoutPath, "utf8")).toContain(
      '<Stack.Screen name="index"',
    );
    const indexSource = readFileSync(indexPath, "utf8");
    expect(indexSource).toContain("<NativeProductionShell");
    expect(indexSource).not.toContain("FoundationShell");
  });

  it.each([
    ".expo/devices.json",
    "android/build.gradle",
    "ios/Podfile",
    "../../.tmp/mobile-poc/api.stdout.log",
  ])("keeps generated local path %s ignored", (generatedPath) => {
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
  });
});
