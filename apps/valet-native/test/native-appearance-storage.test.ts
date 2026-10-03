import { describe, expect, it, vi } from "vitest";
const disk = vi.hoisted(() => ({
  value: null as string | null,
  paths: [] as unknown[][],
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "device-private-document" },
  File: class {
    constructor(...parts: unknown[]) {
      disk.paths.push(parts);
    }
    get exists() {
      return disk.value !== null;
    }
    async text() {
      return disk.value;
    }
    write(value: string) {
      disk.value = value;
    }
  },
}));
import {
  nativeAppearanceStore,
  serializeNativeAppearance,
} from "../src/appearance/native-appearance-store";
import { NativeAppearanceOwner } from "../src/appearance/native-appearance-owner";

describe("existing Expo File System appearance adapter", () => {
  it("uses one private device-local appearance-only file and survives new owners", async () => {
    expect(await nativeAppearanceStore.read()).toBeNull();
    const first = new NativeAppearanceOwner(nativeAppearanceStore);
    await first.restore();
    first.select("dark");
    await first.settled();
    expect(disk.value).toBe(serializeNativeAppearance("dark"));
    // Appearance has no logout/identity API or tenant path. A new owner, as
    // after a process restart or identity replacement, reads the same file.
    for (const action of ["logout", "identity replacement", "restart"]) {
      const next = new NativeAppearanceOwner(nativeAppearanceStore);
      await next.restore();
      expect(next.current().mode, action).toBe("dark");
    }
    expect(
      disk.paths.every(
        (parts) =>
          parts.length === 2 &&
          parts[0] === "device-private-document" &&
          parts[1] === "vaylet-appearance-v1.json",
      ),
    ).toBe(true);
    expect(Object.keys(JSON.parse(disk.value!))).toEqual(["version", "theme"]);
  });
});
