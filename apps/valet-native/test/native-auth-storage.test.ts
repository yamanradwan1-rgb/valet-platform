import { beforeEach, describe, expect, it, vi } from "vitest";

const secureState = vi.hoisted(() => ({ value: null as string | null }));
const fileState = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(async () => {
    secureState.value = null;
  }),
  getItemAsync: vi.fn(async () => secureState.value),
  setItemAsync: vi.fn(async (_key: string, value: string) => {
    secureState.value = value;
  }),
}));

vi.mock("expo-file-system", () => ({
  File: class {
    get exists() {
      return fileState.value !== null;
    }
    async text() {
      return fileState.value ?? "";
    }
    write(value: string) {
      fileState.value = value;
    }
  },
  Paths: { document: {} },
}));

import {
  ExpoInstallationAuthStateStore,
  ExpoSecureRefreshStore,
} from "../src/auth/native-auth-storage";

const generation = "installation-generation-0001";
const refreshToken = `vsr1.${"r".repeat(43)}`;

beforeEach(() => {
  secureState.value = null;
  fileState.value = null;
});

describe("Native auth persistence adapters", () => {
  it("keeps the refresh envelope only in SecureStore", async () => {
    const store = new ExpoSecureRefreshStore();
    await store.write({
      installationGeneration: generation,
      refreshToken,
      version: 1,
    });

    expect(await store.read()).toEqual({
      installationGeneration: generation,
      refreshToken,
      version: 1,
    });
    expect(fileState.value).toBeNull();
    expect(secureState.value).not.toContain("vsa1.");
    await store.delete();
    expect(await store.read()).toBeNull();
  });

  it("stores only non-secret generation and restore block in app-private state", async () => {
    const store = new ExpoInstallationAuthStateStore();
    await store.write({ generation, restoreBlocked: true, version: 1 });

    expect(await store.read()).toEqual({
      generation,
      restoreBlocked: true,
      version: 1,
    });
    expect(fileState.value).not.toContain(refreshToken);
    expect(secureState.value).toBeNull();
  });

  it("returns corrupt persisted values for fail-closed portable validation", async () => {
    secureState.value = "not-json";
    fileState.value = "not-json";
    expect(await new ExpoSecureRefreshStore().read()).toBe("not-json");
    expect(await new ExpoInstallationAuthStateStore().read()).toBe("not-json");
  });
});
