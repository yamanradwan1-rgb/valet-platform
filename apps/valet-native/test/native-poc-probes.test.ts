import { afterEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";

vi.mock("expo-file-system", () => ({
  File: class {},
  Paths: { document: {} },
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

import {
  nativeInstallationAuthFileName,
  nativeRefreshStorageKey,
  nativeSecureStoreOptions,
} from "../src/auth/native-auth-storage";
import {
  nativeInstallationProbeFileName,
  nativeSecureStoreProbeKey,
  probeNativeApiReachability,
  probeNativeInstallationStorage,
  probeNativeSecureStore,
} from "../src/auth/native-poc-probes";
import { resolveNativeApiOrigin } from "../src/auth/native-api-http";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Native physical POC probes", () => {
  it("uses the canonical auth origin for one credential-free GET", async () => {
    vi.stubGlobal("__DEV__", true);
    const origin = resolveNativeApiOrigin("http://192.168.1.67:3001/");
    const fetcher = vi.fn(async () => new Response(undefined, { status: 200 }));

    await expect(probeNativeApiReachability(origin, { fetcher })).resolves.toBe(
      "reachable",
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(`${origin}/`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
      method: "GET",
      signal: expect.any(AbortSignal),
    });
  });

  it("bounds a stalled API probe without retrying or reading a body", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const result = probeNativeApiReachability("https://api.example.com", {
      fetcher,
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(result).resolves.toBe("unreachable");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("keeps the SecureStore probe isolated and deletes after success", async () => {
    let stored: string | null = null;
    const port = {
      delete: vi.fn(async () => {
        stored = null;
      }),
      read: vi.fn(async () => stored),
      write: vi.fn(async (_key: string, value: string) => {
        stored = value;
      }),
    };

    await expect(probeNativeSecureStore(port)).resolves.toBe("ok");
    expect(port.write).toHaveBeenCalledWith(
      nativeSecureStoreProbeKey,
      expect.stringMatching(/^poc-/),
    );
    expect(port.delete).toHaveBeenCalledWith(nativeSecureStoreProbeKey);
    expect(stored).toBeNull();
    expect(nativeSecureStoreProbeKey).not.toBe(nativeRefreshStorageKey);
  });

  it("uses the production SecureStore service characteristics", async () => {
    let stored: string | null = null;
    vi.mocked(SecureStore.setItemAsync).mockImplementation(
      async (_key, value) => {
        stored = value;
      },
    );
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
    vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async () => {
      stored = null;
    });

    await expect(probeNativeSecureStore()).resolves.toBe("ok");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      nativeSecureStoreProbeKey,
      expect.stringMatching(/^poc-/),
      nativeSecureStoreOptions,
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      nativeSecureStoreProbeKey,
      nativeSecureStoreOptions,
    );
  });

  it("attempts SecureStore cleanup after a probe failure", async () => {
    const port = {
      delete: vi.fn(async () => undefined),
      read: vi.fn(async () => null),
      write: vi.fn(async () => {
        throw new Error("synthetic failure");
      }),
    };

    await expect(probeNativeSecureStore(port)).resolves.toBe("failed");
    expect(port.delete).toHaveBeenCalledWith(nativeSecureStoreProbeKey);
  });

  it("keeps the FileSystem probe isolated and cleans up", async () => {
    let stored: string | null = null;
    const authSnapshot = {
      authGeneration: 8,
      phase: "unauthenticated",
      reason: "authentication-failed",
    } as const;
    const port = {
      delete: vi.fn(() => {
        stored = null;
      }),
      read: vi.fn(async () => stored ?? ""),
      write: vi.fn((value: string) => {
        stored = value;
      }),
    };

    await expect(probeNativeInstallationStorage(port)).resolves.toBe("ok");
    expect(port.delete).toHaveBeenCalledOnce();
    expect(stored).toBeNull();
    expect(nativeInstallationProbeFileName).not.toBe(
      nativeInstallationAuthFileName,
    );
    expect(authSnapshot).toEqual({
      authGeneration: 8,
      phase: "unauthenticated",
      reason: "authentication-failed",
    });
  });

  it("reports FileSystem failure while still attempting cleanup", async () => {
    const port = {
      delete: vi.fn(() => undefined),
      read: vi.fn(async () => "mismatch"),
      write: vi.fn(() => undefined),
    };

    await expect(probeNativeInstallationStorage(port)).resolves.toBe("failed");
    expect(port.delete).toHaveBeenCalledOnce();
  });

  it("keeps auth state unchanged when every isolated probe fails", async () => {
    const authSnapshot = {
      authGeneration: 9,
      phase: "unauthenticated",
      reason: "transient-failure",
    } as const;
    const before = JSON.stringify(authSnapshot);
    const fetcher = vi.fn(async () => {
      throw new Error("network unavailable");
    });
    const securePort = {
      delete: vi.fn(async () => undefined),
      read: vi.fn(async () => null),
      write: vi.fn(async () => {
        throw new Error("secure storage unavailable");
      }),
    };
    const filePort = {
      delete: vi.fn(() => undefined),
      read: vi.fn(async () => ""),
      write: vi.fn(() => {
        throw new Error("filesystem unavailable");
      }),
    };

    await expect(
      Promise.all([
        probeNativeApiReachability("https://api.example.com", { fetcher }),
        probeNativeSecureStore(securePort),
        probeNativeInstallationStorage(filePort),
      ]),
    ).resolves.toEqual(["unreachable", "failed", "failed"]);
    expect(JSON.stringify(authSnapshot)).toBe(before);
  });
});
