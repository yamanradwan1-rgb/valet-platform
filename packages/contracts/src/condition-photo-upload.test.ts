import { describe, expect, it } from "vitest";

import {
  CONDITION_PHOTO_MAX_JPEG_BYTES,
  conditionPhotoNoQuerySchema,
  conditionPhotoOperationParamsSchema,
  conditionPhotoReconcileRequestSchema,
  conditionPhotoSafeErrorCodeSchema,
  conditionPhotoStateDiscoverySchema,
  conditionPhotoUploadFieldsSchema,
  conditionPhotoUploadStatusSchema,
} from "./condition-photo-upload.js";

const sessionId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const photoId = "33333333-3333-4333-8333-333333333333";

const pending = {
  operationId,
  valetSessionId: sessionId,
  status: "PENDING",
  retryAction: "RECONCILE",
  retryAfterSeconds: 10,
};
const verified = {
  operationId,
  valetSessionId: sessionId,
  status: "VERIFIED",
  vehiclePhotoId: photoId,
  contentType: "image/jpeg",
  byteSize: 2048,
  verifiedAt: "2026-10-14T10:01:02.123Z",
};
const expired = {
  operationId,
  valetSessionId: sessionId,
  status: "EXPIRED",
  retryAction: "NEW_CAPTURE",
  reason: "EXPIRED",
};
const rejected = {
  operationId,
  valetSessionId: sessionId,
  status: "REJECTED",
  retryAction: "NEW_CAPTURE",
  reason: "INVALID_IMAGE",
};

describe("verified condition-photo shared wire contract", () => {
  it("accepts all four complete status variants", () => {
    for (const status of [pending, verified, expired, rejected]) {
      expect(conditionPhotoUploadStatusSchema.safeParse(status).success).toBe(true);
    }
    for (const action of ["WAIT", "RECONCILE", "RESEND_SAME_BYTES"]) {
      expect(
        conditionPhotoUploadStatusSchema.safeParse({ ...pending, retryAction: action })
          .success,
      ).toBe(true);
    }
  });

  it("rejects cross-state attributes, missing receipt and arbitrary statuses", () => {
    const bad = [
      { ...pending, status: "STORED" },
      { ...pending, vehiclePhotoId: photoId },
      { ...pending, retryAction: "NEW_CAPTURE" },
      { ...verified, status: "PENDING" },
      { ...verified, vehiclePhotoId: undefined },
      { ...verified, retryAction: "WAIT" },
      { ...expired, reason: "INVALID_IMAGE" },
      { ...rejected, reason: "EXPIRED" },
      { ...rejected, retryAction: "WAIT" },
    ];
    for (const input of bad) {
      expect(conditionPhotoUploadStatusSchema.safeParse(input).success).toBe(false);
    }
  });

  it("rejects invalid identity, size, timestamp, and retry bounds", () => {
    const bad = [
      { ...pending, operationId: "invalid" },
      { ...pending, valetSessionId: "000" },
      { ...pending, retryAfterSeconds: 0 },
      { ...pending, retryAfterSeconds: 901 },
      { ...pending, retryAfterSeconds: 0.5 },
      { ...verified, byteSize: 0 },
      { ...verified, byteSize: -1 },
      { ...verified, byteSize: CONDITION_PHOTO_MAX_JPEG_BYTES + 1 },
      { ...verified, byteSize: 1.5 },
      { ...verified, verifiedAt: "yesterday" },
      { ...verified, verifiedAt: "2026-10-14T10:01:02.123+03:00" },
      { ...verified, verifiedAt: "2026-02-30T10:01:02.123Z" },
    ];
    for (const input of bad) {
      expect(conditionPhotoUploadStatusSchema.safeParse(input).success).toBe(false);
    }
  });

  it("never accepts unapproved public storage, hash, auth or scope fields", () => {
    const forbidden = [
      "bucket",
      "bucketAlias",
      "objectKey",
      "objectVersion",
      "storageUrl",
      "presignedUrl",
      "sha256",
      "sourceSha256",
      "canonicalSha256",
      "leaseOwner",
      "leaseToken",
      "staffBearerToken",
      "organizationId",
      "locationId",
      "membershipId",
      "userId",
      "metadata",
      "bytes",
    ];
    for (const key of forbidden) {
      expect(
        conditionPhotoUploadStatusSchema.safeParse({ ...verified, [key]: "secret" })
          .success,
      ).toBe(false);
    }
  });

  it("allows only operationId as multipart metadata and empty reconciliation/query", () => {
    expect(conditionPhotoUploadFieldsSchema.parse({ operationId })).toEqual({ operationId });
    expect(conditionPhotoUploadFieldsSchema.safeParse({ operationId, image: "uri" }).success).toBe(false);
    expect(conditionPhotoUploadFieldsSchema.safeParse({ operationId: "?" }).success).toBe(false);
    expect(conditionPhotoOperationParamsSchema.parse({ operationId, sessionId })).toEqual({ operationId, sessionId });
    expect(conditionPhotoOperationParamsSchema.safeParse({ operationId, sessionId, locationId: photoId }).success).toBe(false);
    expect(conditionPhotoReconcileRequestSchema.parse({})).toEqual({});
    expect(conditionPhotoNoQuerySchema.parse({})).toEqual({});
    expect(conditionPhotoReconcileRequestSchema.safeParse({ objectKey: "evil" }).success).toBe(false);
    expect(conditionPhotoNoQuerySchema.safeParse({ mode: "force" }).success).toBe(false);
  });

  it("rejects unapproved error strings", () => {
    expect(conditionPhotoSafeErrorCodeSchema.safeParse("CONDITION_PHOTO_NOT_FOUND").success).toBe(true);
    expect(conditionPhotoSafeErrorCodeSchema.safeParse("S3_ACCESS_KEY_DENIED").success).toBe(false);
  });

  it("discovers exact-session pending and latest terminal operations with strict policy", () => {
    const state = {
      valetSessionId: sessionId,
      photoPolicy: { required: true, source: "LOCATION_OVERRIDE" },
      qualifyingPhotoPresent: false,
      pendingOperation: pending,
      latestOperation: verified,
    };
    expect(conditionPhotoStateDiscoverySchema.safeParse(state).success).toBe(true);
    expect(conditionPhotoStateDiscoverySchema.safeParse({ ...state, pendingOperation: null, latestOperation: null }).success).toBe(true);
    expect(conditionPhotoStateDiscoverySchema.safeParse({ ...state, photoPolicy: { required: false, source: "ORGANIZATION_DEFAULT" } }).success).toBe(true);
    const invalid = [
      { ...state, pendingOperation: verified },
      { ...state, latestOperation: pending },
      { ...state, latestOperation: { ...expired, valetSessionId: photoId } },
      { ...state, pendingOperation: { ...pending, valetSessionId: photoId } },
      { ...state, photoPolicy: { required: true, source: "STAFF_OVERRIDE" } },
      { ...state, photoPolicy: { required: "yes", source: "LOCATION_OVERRIDE" } },
      { ...state, organizationId: photoId },
      { ...state, photoPolicy: { required: true, source: "LOCATION_OVERRIDE", admin: true } },
    ];
    for (const input of invalid) {
      expect(conditionPhotoStateDiscoverySchema.safeParse(input).success).toBe(false);
    }
  });
});
