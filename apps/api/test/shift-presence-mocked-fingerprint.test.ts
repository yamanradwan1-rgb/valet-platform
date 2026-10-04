import { describe, expect, it } from "vitest";
import {
  fingerprintShiftPresenceIntent,
  fingerprintShiftPresenceRequest,
  type PresenceFingerprintInput,
} from "../src/modules/shifts/shift-presence-fingerprint";

const id = "00000000-0000-4000-8000-000000000001";
const key = new Uint8Array(32).fill(7);
const measurement = {
  latitude: 0,
  longitude: 0,
  accuracyMeters: 10,
  capturedAt: "2026-10-04T12:00:00Z",
};
function input(mocked?: boolean): PresenceFingerprintInput {
  return {
    organizationId: id,
    locationId: id,
    membershipId: id,
    userId: id,
    operationId: id,
    action: "END",
    shiftId: id,
    cashReported: "001.230",
    policyFingerprint: "c".repeat(64),
    evidence: {
      kind: "MEASURED",
      challengeId: id,
      clientSampleId: id,
      measurement: {
        ...measurement,
        ...(mocked === undefined ? {} : { mocked }),
      },
    },
  };
}

describe("protected request identity for optional mocked signal", () => {
  it("preserves the exact pre-correction v1 digest when the signal is absent", () => {
    // Frozen from the current-main v1 tuple before adding optional source input.
    expect(fingerprintShiftPresenceRequest(input(), key)).toBe(
      "04a285122810ba53eadf1c37279d087c89a4536303308437db8515b2f8fc2791",
    );
  });

  it("distinguishes true, false and absent for otherwise identical evidence", () => {
    const fingerprints = [undefined, false, true].map((mocked) =>
      fingerprintShiftPresenceRequest(input(mocked), key),
    );
    expect(new Set(fingerprints).size).toBe(3);
  });

  it.each([undefined, false, true])(
    "is deterministic for mocked=%s",
    (mocked) => {
      const value = input(mocked);
      const digest = fingerprintShiftPresenceRequest(value, key);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
      expect(
        fingerprintShiftPresenceRequest(JSON.parse(JSON.stringify(value)), key),
      ).toBe(digest);
      expect(
        fingerprintShiftPresenceRequest(value, new Uint8Array(32).fill(8)),
      ).not.toBe(digest);
    },
  );

  it("does not change pre-acquisition target/cash identity", () => {
    const fingerprints = [undefined, false, true].map((mocked) =>
      fingerprintShiftPresenceIntent(input(mocked), key),
    );
    expect(new Set(fingerprints).size).toBe(1);
  });
});
