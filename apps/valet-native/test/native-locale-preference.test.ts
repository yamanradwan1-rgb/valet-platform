import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => ({
  File: class {},
  Paths: { document: "/preferences" },
}));

import {
  createNativeLocalePreference,
  parseNativeLocalePreference,
  selectNativeEmployeeLocale,
  type NativeLocalePreferenceFile,
} from "../src/i18n/native-locale-preference";

class MemoryLocaleFile implements NativeLocalePreferenceFile {
  content: string | undefined;
  failRead = false;
  failWrite = false;

  constructor(content?: string) {
    this.content = content;
  }

  get exists() {
    return this.content !== undefined;
  }

  textSync() {
    if (this.failRead) throw new Error("read failed");
    return this.content ?? "";
  }

  write(value: string) {
    if (this.failWrite) throw new Error("write failed");
    this.content = value;
  }
}

describe("native employee locale preference", () => {
  let file: MemoryLocaleFile;

  beforeEach(() => {
    file = new MemoryLocaleFile();
  });

  it.each([
    [undefined, "en"],
    ["en", "en"],
    ["ar", "ar"],
    ["fr", "en"],
    ["{broken", "en"],
  ] as const)("restores %s as %s", (stored, expected) => {
    file.content = stored;
    expect(createNativeLocalePreference(file).read()).toBe(expected);
  });

  it("falls back to English when the bounded synchronous read fails", () => {
    file.content = "ar";
    file.failRead = true;
    expect(createNativeLocalePreference(file).read()).toBe("en");
  });

  it("selects and persists both supported locales", () => {
    const preference = createNativeLocalePreference(file);
    expect(selectNativeEmployeeLocale(preference, "ar")).toBe("ar");
    expect(file.content).toBe("ar");
    expect(selectNativeEmployeeLocale(preference, "en")).toBe("en");
    expect(file.content).toBe("en");
  });

  it("restores the last selection on a new adapter instance", () => {
    selectNativeEmployeeLocale(createNativeLocalePreference(file), "ar");
    expect(createNativeLocalePreference(file).read()).toBe("ar");
  });

  it("returns the new session locale even when persistence fails", () => {
    file.content = "en";
    file.failWrite = true;
    const preference = createNativeLocalePreference(file);
    expect(selectNativeEmployeeLocale(preference, "ar")).toBe("ar");
    expect(file.content).toBe("en");
  });

  it("resolves stored Arabic synchronously for the first localized render", () => {
    file.content = "ar";
    const locale = createNativeLocalePreference(file).read();
    expect(locale).toBe("ar");
  });

  it("keeps presentation storage independent of auth lifecycle values", () => {
    file.content = "ar";
    const preference = createNativeLocalePreference(file);
    for (const _authEvent of ["logout", "generation-change"]) {
      expect(preference.read()).toBe("ar");
    }
  });

  it("accepts only trimmed supported locale values", () => {
    expect(parseNativeLocalePreference(" ar ")).toBe("ar");
    expect(parseNativeLocalePreference(null)).toBe("en");
  });
});
