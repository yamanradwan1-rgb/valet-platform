import type { EmployeeAppearanceMode } from "./employee-palette";

export interface NativeAppearanceStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export function parseNativeAppearance(
  value: string | null,
): EmployeeAppearanceMode {
  try {
    const record: unknown = JSON.parse(value ?? "null");
    if (
      record &&
      typeof record === "object" &&
      !Array.isArray(record) &&
      Object.keys(record).length === 2 &&
      "version" in record &&
      record.version === 1 &&
      "theme" in record &&
      (record.theme === "light" || record.theme === "dark")
    )
      return record.theme;
  } catch {
    /* Invalid preferences never prevent startup. */
  }
  return "light";
}

export function serializeNativeAppearance(
  theme: EmployeeAppearanceMode,
): string {
  return JSON.stringify({ version: 1, theme });
}

export const nativeAppearanceStore: NativeAppearanceStore = {
  async read() {
    const { File, Paths } = await import("expo-file-system");
    const file = new File(Paths.document, "vaylet-appearance-v1.json");
    return file.exists ? file.text() : null;
  },
  async write(value) {
    const { File, Paths } = await import("expo-file-system");
    const file = new File(Paths.document, "vaylet-appearance-v1.json");
    file.write(value);
  },
};
