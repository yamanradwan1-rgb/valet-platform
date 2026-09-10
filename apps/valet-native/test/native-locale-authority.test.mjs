import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) =>
  readFileSync(resolve(import.meta.dirname, `../src/${path}`), "utf8");

describe("Native production locale authority", () => {
  const shell = read("shell/native-production-shell.tsx");
  const hook = read("i18n/use-native-employee-locale.ts");
  const storage = read("i18n/native-locale-preference.ts");

  it("owns locale once above every production gate and workflow", () => {
    expect(shell.match(/useNativeEmployeeLocale\(/g)).toHaveLength(1);
    expect(shell).not.toContain('useState<EmployeeLocale>("en")');
    expect(shell).toContain("locale={locale}");
    expect(shell).toContain("onSelectLocale={setLocale}");
  });

  it("restores synchronously before the first localized product render", () => {
    expect(hook).toContain("useState<EmployeeLocale>(() =>");
    expect(hook).toContain("preference.read()");
    expect(storage).toContain("file.textSync()");
  });

  it("keeps preference storage separate from auth and workflow authority", () => {
    expect(storage).not.toMatch(/auth|credential|token|guest|workflow/i);
    expect(hook).not.toMatch(/auth|credential|token|guest|workflow/i);
  });

  it("updates presentation before best-effort persistence", () => {
    expect(hook.indexOf("setLocaleState(next)")).toBeLessThan(
      hook.indexOf("selectNativeEmployeeLocale(preference, next)"),
    );
  });
});
