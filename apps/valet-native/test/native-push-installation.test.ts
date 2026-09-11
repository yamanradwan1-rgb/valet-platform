import { describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => ({
  File: class {},
  Paths: { document: "/synthetic-document" },
}));

import { NativePushInstallationIdOwner } from "../src/notifications/native-push-installation";

const first = "40000000-0000-4000-8000-000000000004";
const second = "50000000-0000-4000-8000-000000000005";

describe("Native push installation identity", () => {
  it("creates, persists, and repeatedly returns a valid UUID", async () => {
    let stored: unknown = null;
    const store = {
      read: vi.fn(async () => stored),
      write: vi.fn(async (value: unknown) => {
        stored = value;
      }),
    };
    const owner = new NativePushInstallationIdOwner(store, () => first);
    expect(await owner.getOrCreate()).toBe(first);
    expect(await owner.getOrCreate()).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.write).toHaveBeenCalledOnce();
  });

  it("preserves the installation across account owners and app launches", async () => {
    const stored = { installationId: first, version: 1 } as const;
    const store = { read: async () => stored, write: vi.fn() };
    const accountA = new NativePushInstallationIdOwner(store, () => second);
    const accountB = new NativePushInstallationIdOwner(store, () => second);
    expect(await accountA.getOrCreate()).toBe(first);
    expect(await accountB.getOrCreate()).toBe(first);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("creates a new UUID when local installation state is missing", async () => {
    const store = {
      read: async () => null,
      write: vi.fn(async () => undefined),
    };
    expect(
      await new NativePushInstallationIdOwner(
        store,
        () => second,
      ).getOrCreate(),
    ).toBe(second);
    expect(store.write).toHaveBeenCalledWith({
      installationId: second,
      version: 1,
    });
  });

  it("single-flights concurrent creation", async () => {
    const store = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
    };
    const create = vi.fn(() => first);
    const owner = new NativePushInstallationIdOwner(store, create);
    await expect(
      Promise.all([owner.getOrCreate(), owner.getOrCreate()]),
    ).resolves.toEqual([first, first]);
    expect(create).toHaveBeenCalledOnce();
    expect(store.write).toHaveBeenCalledOnce();
  });

  it("rejects a generator that cannot supply a UUID", async () => {
    const store = {
      read: async () => null,
      write: vi.fn(async () => undefined),
    };
    await expect(
      new NativePushInstallationIdOwner(store, () => "install-1").getOrCreate(),
    ).rejects.toThrow("Push installation state is unavailable.");
    expect(store.write).not.toHaveBeenCalled();
  });
});
