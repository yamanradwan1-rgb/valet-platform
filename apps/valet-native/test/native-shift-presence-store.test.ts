import { beforeEach, expect, it, vi } from "vitest";
import type { PresenceDescriptor } from "@valet/employee-client";

const storage = vi.hoisted(() => ({
  raw: null as string | null,
  generation: "installation-generation-0001",
  blocked: false,
}));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: vi.fn(async () => storage.raw),
  setItemAsync: vi.fn(async (_key: string, value: string) => {
    storage.raw = value;
  }),
  deleteItemAsync: vi.fn(async () => {
    storage.raw = null;
  }),
}));
vi.mock("../src/auth/native-auth-storage", () => ({
  ExpoInstallationAuthStateStore: class {
    async read() {
      return {
        version: 1,
        generation: storage.generation,
        restoreBlocked: storage.blocked,
      };
    }
  },
}));
import * as SecureStore from "expo-secure-store";
import {
  ExpoShiftPresenceStore,
  parseNativePresenceDescriptor,
} from "../src/shift/native-shift-presence-store";

const id = "11111111-1111-4111-8111-111111111111";
const descriptor: PresenceDescriptor = {
  version: 1,
  operationId: id,
  stage: "LOCAL",
  target: {
    action: "START",
    identityGeneration: 1,
    membershipId: id,
    organizationId: id,
    locationId: id,
    shiftId: null,
    cashReported: null,
  },
};
beforeEach(() => {
  storage.raw = null;
  storage.blocked = false;
  storage.generation = "installation-generation-0001";
  vi.clearAllMocks();
});

it.each(["LOCAL", "SHIFT_MAY_HAVE_LEFT", "EXCEPTION_MAY_HAVE_LEFT"] as const)(
  "persists only controlled %s recovery stage",
  async (stage) => {
    const value = { ...descriptor, stage };
    const store = new ExpoShiftPresenceStore("START");
    await store.write(value);
    expect(await store.read()).toEqual(value);
    expect(Object.keys(JSON.parse(storage.raw!).descriptor).sort()).toEqual([
      "operationId",
      "stage",
      "target",
      "version",
    ]);
  },
);

it("legacy stage-less recovery stays readable and arbitrary stage is rejected", () => {
  const legacy = { ...descriptor };
  delete legacy.stage;
  expect(parseNativePresenceDescriptor(legacy)).toEqual(legacy);
  expect(
    parseNativePresenceDescriptor({ ...descriptor, stage: "GPS_CAPTURED" }),
  ).toBeUndefined();
});

it("restart reads only an opaque installation-bound descriptor", async () => {
  await new ExpoShiftPresenceStore("START").write(descriptor);
  expect(await new ExpoShiftPresenceStore("START").read()).toEqual(descriptor);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    {
      keychainAccessible: 6,
      keychainService: "com.vaylet.employee.shift-presence",
    },
  );
  for (const sensitive of [
    "latitude",
    "longitude",
    "accuracy",
    "mocked",
    "challengeId",
    "measurement",
    "refreshToken",
    "accessToken",
  ])
    expect(storage.raw).not.toContain(sensitive);
  storage.generation = "different-installation-0002";
  expect(await new ExpoShiftPresenceStore("START").read()).toBeUndefined();
});
it.each(["measurement", "challengeId", "accessToken", "mocked"])(
  "rejects descriptor contamination by %s",
  (field) => {
    expect(
      parseNativePresenceDescriptor({ ...descriptor, [field]: "private" }),
    ).toBeUndefined();
    expect(
      parseNativePresenceDescriptor({
        ...descriptor,
        target: { ...descriptor.target, [field]: "private" },
      }),
    ).toBeUndefined();
  },
);
it("rejects corruption, invalid targets and blocked restore", async () => {
  const store = new ExpoShiftPresenceStore("START");
  storage.raw = "broken JSON";
  expect(await store.read()).toBeUndefined();
  expect(
    parseNativePresenceDescriptor({
      ...descriptor,
      target: { ...descriptor.target, membershipId: "unscoped" },
    }),
  ).toBeUndefined();
  await store.write(descriptor);
  storage.blocked = true;
  expect(await store.read()).toBeUndefined();
  await expect(store.write(descriptor)).rejects.toThrow();
});
it("logout deletion is serialized after an older write", async () => {
  let release!: () => void;
  vi.mocked(SecureStore.setItemAsync).mockImplementationOnce(
    async (_key, raw) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      storage.raw = raw;
    },
  );
  const store = new ExpoShiftPresenceStore("END");
  const write = store.write(descriptor);
  for (let count = 0; count < 10; count += 1) await Promise.resolve();
  const purge = store.delete();
  release();
  await Promise.all([write, purge]);
  expect(storage.raw).toBeNull();
});

it("End stores only typed historical scope needed by the existing presentation", async () => {
  const end: PresenceDescriptor = {
    ...descriptor,
    target: {
      ...descriptor.target,
      action: "END",
      shiftId: id,
      cashReported: "1",
      currency: "JOD",
      shiftStartedAt: "2026-10-04T10:00:00Z",
      role: "VALET_EMPLOYEE",
    },
  };
  const store = new ExpoShiftPresenceStore("END");
  await store.write(end);
  expect(await store.read()).toEqual(end);
  expect(
    parseNativePresenceDescriptor({
      ...end,
      target: { ...end.target, role: "ORG_ADMIN" },
    }),
  ).toBeUndefined();
});
