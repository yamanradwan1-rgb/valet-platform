import { describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import {
  projectConditionPhotoStatus,
  readConditionPhotoRecovery,
  readConditionPhotoStatus,
  type ConditionPhotoReadScope,
} from "../src/modules/vehicle-photos/condition-photo-status-query";
import { readConditionPhotoDiscovery } from "../src/modules/vehicle-photos/condition-photo-discovery-query";

const sessionId = "11111111-1111-4111-8111-111111111111";
const clientOperationId = "22222222-2222-4222-8222-222222222222";
const photoId = "33333333-3333-4333-8333-333333333333";
const scope: ConditionPhotoReadScope = {
  organizationId: "44444444-4444-4444-8444-444444444444",
  locationId: "55555555-5555-4555-8555-555555555555",
  valetSessionId: sessionId,
  actorMembershipId: "66666666-6666-4666-8666-666666666666",
};

const pending = {
  client_operation_id: clientOperationId,
  valet_session_id: sessionId,
  status: "PENDING" as const,
  verified_photo_id: null,
  verified_at: null,
  byte_size: null,
  lease_live: true,
};

const verified = {
  ...pending,
  status: "VERIFIED" as const,
  verified_photo_id: photoId,
  verified_at: new Date("2026-10-14T10:00:00.000Z"),
  byte_size: 120_000,
  lease_live: false,
};

function database(rows: readonly object[]) {
  const query = vi.fn(async () => ({ rows }));
  return { transaction: { query } as unknown as PostgresTransaction, query };
}

describe("condition photo public read models", () => {
  it("projects only safe PENDING and VERIFIED fields using client operation identity", () => {
    expect(projectConditionPhotoStatus(pending)).toEqual({
      operationId: clientOperationId,
      valetSessionId: sessionId,
      status: "PENDING",
      retryAction: "WAIT",
      retryAfterSeconds: 5,
    });
    expect(projectConditionPhotoStatus({ ...pending, lease_live: false })).toMatchObject({
      status: "PENDING",
      retryAction: "RECONCILE",
    });
    expect(projectConditionPhotoStatus(verified)).toEqual({
      operationId: clientOperationId,
      valetSessionId: sessionId,
      status: "VERIFIED",
      vehiclePhotoId: photoId,
      contentType: "image/jpeg",
      byteSize: 120_000,
      verifiedAt: "2026-10-14T10:00:00.000Z",
    });
  });

  it("fails closed on missing VERIFIED proof rather than inventing a receipt", () => {
    expect(() => projectConditionPhotoStatus({
      ...verified,
      verified_at: null,
    })).toThrow();
    expect(() => projectConditionPhotoStatus({ ...pending, status: "REJECTED" })).toThrow();
  });

  it("requires exact persisted organization/location/session/member/client UUID", async () => {
    const db = database([pending]);
    expect(await readConditionPhotoStatus(db.transaction, scope, clientOperationId))
      .toMatchObject({ operationId: clientOperationId, status: "PENDING" });
    const [sql, args] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("o.client_operation_id = $5");
    expect(sql).toContain("o.actor_membership_id = $4");
    expect(args).toEqual([
      scope.organizationId, scope.locationId, scope.valetSessionId,
      scope.actorMembershipId, clientOperationId,
    ]);
    expect(sql).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  });

  it("returns one PENDING and one last terminal result, not a broad history", async () => {
    const db = database([pending, verified]);
    const result = await readConditionPhotoRecovery(db.transaction, scope);
    expect(result.pendingOperation?.status).toBe("PENDING");
    expect(result.latestOperation?.status).toBe("VERIFIED");
    const [sql] = db.query.mock.calls[0] as unknown as [string];
    expect(sql).toContain("status = 'PENDING'");
    expect(sql).toContain("ORDER BY created_at DESC, id DESC LIMIT 1");
    expect(sql).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  });

  it("discovery respects override but cannot claim Check-In qualification before P3", async () => {
    const calls = [
      [{ check_in_photos_required: false, check_in_photos_required_override: true }],
      [verified],
    ];
    const query = vi.fn(async () => ({ rows: calls.shift() ?? [] }));
    const result = await readConditionPhotoDiscovery(
      { query } as unknown as PostgresTransaction,
      scope,
    );
    expect(result.photoPolicy).toEqual({
      required: true,
      source: "LOCATION_OVERRIDE",
    });
    expect(result.qualifyingPhotoPresent).toBe(false);
    expect(result.pendingOperation).toBeNull();
    expect(result.latestOperation?.status).toBe("VERIFIED");
  });
});
