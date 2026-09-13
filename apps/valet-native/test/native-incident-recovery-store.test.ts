import { beforeEach, describe, expect, it, vi } from "vitest";

const secure = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  ...secure,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
}));

import {
  ExpoIncidentRecoveryStore,
  nativeIncidentRecoveryStorageKey,
  nativeIncidentRecoveryStoreOptions,
} from "../src/incident/native-incident-recovery-store";

const marker = {
  createdAt: "2026-09-12T12:00:00.000Z",
  incidentId: "018f1234-5678-8abc-9234-56789abcdef0",
  installationGeneration: "installation-1",
  locationId: "018f1234-5678-4abc-a234-56789abcdef1",
  membershipId: "018f1234-5678-4abc-a234-56789abcdef2",
  organizationId: "018f1234-5678-4abc-a234-56789abcdef3",
  protocol: "actor-bound-intent-v1",
  sessionId: "018f1234-5678-4abc-a234-56789abcdef4",
  version: 1,
} as const;

describe("Expo Incident recovery store", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializes exactly the accepted no-content marker into device-only SecureStore", async () => {
    secure.setItemAsync.mockResolvedValue(undefined);
    await new ExpoIncidentRecoveryStore().write(marker);
    expect(secure.setItemAsync).toHaveBeenCalledTimes(1);
    const [key, serialized, options] = secure.setItemAsync.mock.calls[0]!;
    expect(key).toBe(nativeIncidentRecoveryStorageKey);
    expect(options).toEqual(nativeIncidentRecoveryStoreOptions);
    expect(JSON.parse(serialized)).toEqual(marker);
    expect(Object.keys(JSON.parse(serialized)).sort()).toEqual(
      Object.keys(marker).sort(),
    );
    for (const forbidden of [
      "userId",
      "description",
      "severity",
      "type",
      "body",
      "payloadHash",
      "Authorization",
      "accessToken",
      "refreshToken",
      "guestToken",
      "handoffProof",
      "vehicle",
      "customer",
      "key",
      "navigation",
      "retry",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(nativeIncidentRecoveryStoreOptions).toMatchObject({
      keychainAccessible: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
      keychainService: "com.vaylet.employee.incident-recovery",
    });
  });

  it("reads parsed data and deletes through the dedicated key", async () => {
    secure.getItemAsync.mockResolvedValue(JSON.stringify(marker));
    secure.deleteItemAsync.mockResolvedValue(undefined);
    const store = new ExpoIncidentRecoveryStore();
    await expect(store.read()).resolves.toEqual(marker);
    await store.delete();
    expect(secure.deleteItemAsync).toHaveBeenCalledWith(
      nativeIncidentRecoveryStorageKey,
      nativeIncidentRecoveryStoreOptions,
    );
  });
});
