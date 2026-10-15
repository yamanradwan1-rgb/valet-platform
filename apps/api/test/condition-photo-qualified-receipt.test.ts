import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import type { PrivatePhotoStore } from "../src/modules/vehicle-photos/private-photo-store";
import {
  proveSelectedConditionPhotoBytes,
  receiptMatchesCurrentVerifiedEvidence,
  selectVerifiedConditionPhotoCandidates,
  type SelectedConditionPhotoCandidate,
  type TrustedConditionPhotoReceipt,
} from "../src/modules/valet-sessions/condition-photo-qualified-receipt";

const operationId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const photoId = "33333333-3333-4333-8333-333333333333";
const organizationId = "44444444-4444-4444-8444-444444444444";
const locationId = "55555555-5555-4555-8555-555555555555";
const valetSessionId = "66666666-6666-4666-8666-666666666666";
const capturedByMembershipId = "77777777-7777-4777-8777-777777777777";
const objectKey = `condition-photo/${operationId}/${attemptId}`;
const original = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 42]);
const nonce = "server-created-request-nonce-unique";

const candidate: SelectedConditionPhotoCandidate = {
  photoId,
  operationId,
  attemptId,
  capturedByMembershipId,
  organizationId,
  locationId,
  valetSessionId,
  objectKey,
  bucketAlias: "photo_private",
  objectVersion: "version-1",
  contentSha256: createHash("sha256").update(original).digest(),
  byteSize: original.length,
};

const scope = { organizationId, locationId, valetSessionId };

function store(bytes: Buffer, version = "version-1"): PrivatePhotoStore {
  return {
    readExact: vi.fn(async () => ({ bytes: Buffer.from(bytes), version })),
  } as unknown as PrivatePhotoStore;
}

function transaction(qualifies = true) {
  const query = vi.fn(async (...args: unknown[]) => {
    void args;
    return { rows: [{ qualifies }] };
  });
  return { query, tx: { query } as unknown as PostgresTransaction };
}

describe("P3 server-only verified object receipt (NOT YET WIRED INTO CHECK-IN)", () => {
  it("lists only selected VERIFIED+AVAILABLE exact scope candidates, bounded to ten", async () => {
    const query = vi.fn(async (...args: unknown[]) => {
      void args;
      return { rows: [{
        photo_id: photoId,
        operation_id: operationId,
        attempt_id: attemptId,
        captured_by_membership_id: capturedByMembershipId,
        object_key: objectKey,
        bucket_alias: "photo_private",
        object_version: "version-1",
        content_sha256: candidate.contentSha256,
        byte_size: original.length,
      }] };
    });
    const selected = await selectVerifiedConditionPhotoCandidates(
      { query } as unknown as PostgresTransaction,
      scope,
    );
    expect(selected).toEqual([candidate]);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("o.status = 'VERIFIED'");
    expect(sql).toContain("a.status = 'SELECTED'");
    expect(sql).toContain("availability.state = 'AVAILABLE'");
    expect(sql).toContain("v.purpose = 'CHECK_IN_CONDITION'");
    expect(sql).toContain("LIMIT 10");
    expect(sql).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
  });

  it("rejects metadata-only, missing receipt, or forged client objects without SQL", async () => {
    const db = transaction();
    expect(await receiptMatchesCurrentVerifiedEvidence(db.tx, scope, undefined, nonce))
      .toBe(false);
    const forged = Object.freeze({
      kind: "TRUSTED_CONDITION_PHOTO_RECEIPT" as const,
    }) as TrustedConditionPhotoReceipt;
    expect(await receiptMatchesCurrentVerifiedEvidence(db.tx, scope, forged, nonce))
      .toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("checks exact private bytes/sha/version and binds receipt to request + scope", async () => {
    const privateStore = store(original);
    const receipt = await proveSelectedConditionPhotoBytes(
      privateStore, candidate, "photo_private", nonce,
    );
    expect(receipt).toBeDefined();
    expect(privateStore.readExact).toHaveBeenCalledWith({
      key: objectKey,
      version: "version-1",
    });
    const db = transaction(true);
    expect(await receiptMatchesCurrentVerifiedEvidence(db.tx, scope, receipt, nonce))
      .toBe(true);
    expect(await receiptMatchesCurrentVerifiedEvidence(
      db.tx, scope, receipt, "different-server-request-nonce",
    )).toBe(false);
    expect(await receiptMatchesCurrentVerifiedEvidence(
      db.tx, { ...scope, valetSessionId: attemptId }, receipt, nonce,
    )).toBe(false);
    expect(db.query).toHaveBeenCalledTimes(1);
    const sql = String(db.query.mock.calls[0]?.[0]);
    expect(sql).toContain("availability.state = 'AVAILABLE'");
    expect(sql).toContain("a.object_version IS NOT DISTINCT FROM $12::text");
  });

  it("fails closed on corrupt bytes, version mismatch, missing bucket and DB unavailability", async () => {
    expect(await proveSelectedConditionPhotoBytes(
      store(Buffer.from("different")), candidate, "photo_private", nonce,
    )).toBeUndefined();
    expect(await proveSelectedConditionPhotoBytes(
      store(original, "wrong-version"), candidate, "photo_private", nonce,
    )).toBeUndefined();
    expect(await proveSelectedConditionPhotoBytes(
      store(original), candidate, "foreign-bucket", nonce,
    )).toBeUndefined();
    const receipt = await proveSelectedConditionPhotoBytes(
      store(original), candidate, "photo_private", nonce,
    );
    expect(await receiptMatchesCurrentVerifiedEvidence(
      transaction(false).tx, scope, receipt, nonce,
    )).toBe(false);
  });
});
