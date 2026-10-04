import { createHmac } from "node:crypto";

import {
  shiftPresenceDigestSchema,
  shiftPresenceMeasurementSchema,
  shiftPresenceOperationSchema,
  shiftPresenceScopeSchema,
} from "@valet/contracts";

export interface PresenceFingerprintInput {
  readonly organizationId: string;
  readonly locationId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly operationId: string;
  readonly action: "START" | "END";
  readonly shiftId: string | null;
  readonly cashReported: string | null;
  readonly policyFingerprint: string;
  readonly evidence:
    | {
        readonly kind: "MEASURED";
        readonly challengeId: string;
        readonly clientSampleId: string;
        readonly measurement: unknown;
      }
    | {
        readonly kind: "EXCEPTION";
        readonly challengeId: string;
        readonly exceptionId: string;
      }
    | { readonly kind: "MISSING"; readonly challengeId: string };
}

function canonicalCash(value: string | null): string | null {
  if (value === null) return null;
  if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(value))
    throw new Error("PRESENCE_FINGERPRINT_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const decimal = fraction.replace(/0+$/, "");
  return `${BigInt(whole!)}${decimal === "" ? "" : `.${decimal}`}`;
}

/** Trusted caller only. Raw fix is transient HMAC input, never a public digest/log. */
export function fingerprintShiftPresenceRequest(
  input: PresenceFingerprintInput,
  key: Uint8Array,
): string {
  if (key.byteLength < 32) throw new Error("PRESENCE_FINGERPRINT_KEY_INVALID");
  const identity = shiftPresenceOperationSchema.parse({
    organizationId: input.organizationId,
    locationId: input.locationId,
    userId: input.userId,
    membershipId: input.membershipId,
    action: input.action,
    shiftId: input.shiftId,
    operationId: input.operationId,
    targetFingerprint: "0".repeat(64),
  });
  if ((input.action === "START") !== (input.cashReported === null)) {
    throw new Error("PRESENCE_FINGERPRINT_INVALID");
  }
  const evidence = input.evidence;
  const uuid = shiftPresenceScopeSchema.shape.userId;
  uuid.parse(evidence.challengeId);
  shiftPresenceDigestSchema.parse(input.policyFingerprint);
  let evidenceIdentity: readonly unknown[];
  if (evidence.kind === "MEASURED") {
    uuid.parse(evidence.clientSampleId);
    const fix = shiftPresenceMeasurementSchema.parse(evidence.measurement);
    evidenceIdentity = [
      evidence.kind,
      evidence.challengeId,
      evidence.clientSampleId,
      new Date(fix.capturedAt).toISOString(),
      fix.latitude,
      fix.longitude,
      fix.accuracyMeters,
    ];
  } else if (evidence.kind === "EXCEPTION") {
    uuid.parse(evidence.exceptionId);
    evidenceIdentity = [
      evidence.kind,
      evidence.challengeId,
      evidence.exceptionId,
    ];
  } else {
    evidenceIdentity = [evidence.kind, evidence.challengeId];
  }
  const canonical = [
    "shift-presence-request:v1",
    identity.userId,
    identity.membershipId,
    identity.organizationId,
    identity.locationId,
    identity.action,
    identity.shiftId,
    canonicalCash(input.cashReported),
    input.policyFingerprint,
    evidenceIdentity,
  ];
  return createHmac("sha256", key)
    .update(JSON.stringify(canonical))
    .digest("hex");
}

/** Allocated before measurement/challenge issuance; action/target/cash are already fixed. */
export function fingerprintShiftPresenceIntent(
  input: Omit<PresenceFingerprintInput, "evidence" | "policyFingerprint">,
  key: Uint8Array,
): string {
  if (key.byteLength < 32) throw new Error("PRESENCE_FINGERPRINT_KEY_INVALID");
  const identity = shiftPresenceOperationSchema.parse({
    organizationId: input.organizationId,
    locationId: input.locationId,
    userId: input.userId,
    membershipId: input.membershipId,
    action: input.action,
    shiftId: input.shiftId,
    operationId: input.operationId,
    targetFingerprint: "0".repeat(64),
  });
  if ((input.action === "START") !== (input.cashReported === null))
    throw new Error("PRESENCE_FINGERPRINT_INVALID");
  return createHmac("sha256", key)
    .update(
      JSON.stringify([
        "shift-presence-intent:v1",
        identity.userId,
        identity.membershipId,
        identity.organizationId,
        identity.locationId,
        identity.action,
        identity.shiftId,
        canonicalCash(input.cashReported),
      ]),
    )
    .digest("hex");
}
