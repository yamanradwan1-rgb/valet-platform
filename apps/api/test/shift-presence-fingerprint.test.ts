import { describe, expect, it } from "vitest";

import { fingerprintShiftPresenceIntent, fingerprintShiftPresenceRequest, type PresenceFingerprintInput } from "../src/modules/shifts/shift-presence-fingerprint";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const key = new Uint8Array(32).fill(7);
const request: PresenceFingerprintInput = {
  organizationId: id, locationId: id, membershipId: id, userId: id, operationId: id,
  action: "END", shiftId: id, cashReported: "001.230",
  policyFingerprint: "c".repeat(64),
  evidence: { kind: "MEASURED", challengeId: id, clientSampleId: id,
    measurement: { latitude: 0, longitude: 0, accuracyMeters: 10, capturedAt: "2026-10-04T12:00:00Z" } },
};

describe("versioned keyed canonical identity", () => {
  it("normalizes cash and equivalent timestamp representations", () => {
    expect(fingerprintShiftPresenceRequest(request, key)).toBe(fingerprintShiftPresenceRequest({ ...request,
      cashReported: "1.23", evidence: { kind: "MEASURED", challengeId: id, clientSampleId: id,
        measurement: { latitude: 0, longitude: 0, accuracyMeters: 10, capturedAt: "2026-10-04T15:00:00+03:00" } } }, key));
  });
  it.each(["organizationId", "locationId", "membershipId", "userId", "shiftId"] as const)("binds %s", (field) => {
    expect(fingerprintShiftPresenceRequest({ ...request, [field]: other }, key)).not.toBe(fingerprintShiftPresenceRequest(request, key));
  });
  it("binds cash, challenge, sample and raw transient evidence without exposing it", () => {
    const original = fingerprintShiftPresenceRequest(request, key);
    expect(original).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintShiftPresenceRequest({ ...request, cashReported: "2.23" }, key)).not.toBe(original);
    expect(fingerprintShiftPresenceRequest({ ...request, policyFingerprint: "d".repeat(64) }, key)).not.toBe(original);
    expect(fingerprintShiftPresenceRequest({ ...request, evidence: { kind: "EXCEPTION", challengeId: id, exceptionId: id } }, key)).not.toBe(original);
    expect(fingerprintShiftPresenceRequest({ ...request, evidence: { kind: "MEASURED", challengeId: other, clientSampleId: id,
      measurement: { latitude: 0, longitude: 0, accuracyMeters: 10, capturedAt: "2026-10-04T12:00:00Z" } } }, key)).not.toBe(original);
    expect(fingerprintShiftPresenceRequest({ ...request, evidence: { kind: "MEASURED", challengeId: id, clientSampleId: other,
      measurement: { latitude: 0, longitude: 0, accuracyMeters: 10, capturedAt: "2026-10-04T12:00:00Z" } } }, key)).not.toBe(original);
    expect(fingerprintShiftPresenceRequest({ ...request, evidence: { kind: "MEASURED", challengeId: id, clientSampleId: id,
      measurement: { latitude: 0.001, longitude: 0, accuracyMeters: 10, capturedAt: "2026-10-04T12:00:00Z" } } }, key)).not.toBe(original);
    expect(fingerprintShiftPresenceRequest(request, new Uint8Array(32).fill(8))).not.toBe(original);
  });
  it("allocates intent before GPS and refuses insufficient key material", () => {
    const intent = fingerprintShiftPresenceIntent(request, key);
    expect(intent).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintShiftPresenceIntent({ ...request, cashReported: "1.23" }, key)).toBe(intent);
    expect(fingerprintShiftPresenceIntent({ ...request, cashReported: "1.24" }, key)).not.toBe(intent);
    expect(() => fingerprintShiftPresenceRequest(request, new Uint8Array(31))).toThrow("PRESENCE_FINGERPRINT_KEY_INVALID");
  });
});
