import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { PostgresPool, PostgresTransaction } from "../src/common/database/postgres";
import type { PrivatePhotoStore } from "../src/modules/vehicle-photos/private-photo-store";
import { createCheckInPhotoPreflight } from "../src/modules/valet-sessions/check-in-photo-preflight";
import { evaluateLockedCheckInConditionGuard } from "../src/modules/valet-sessions/check-in-condition-guard";

const id = {
  user: "11111111-1111-4111-8111-111111111111",
  session: "22222222-2222-4222-8222-222222222222",
  organization: "33333333-3333-4333-8333-333333333333",
  location: "44444444-4444-4444-8444-444444444444",
  membership: "55555555-5555-4555-8555-555555555555",
  photo: "66666666-6666-4666-8666-666666666666",
  operation: "77777777-7777-4777-8777-777777777777",
  attempt: "88888888-8888-4888-8888-888888888888",
};
const request = { authenticatedUserId: id.user, valetSessionId: id.session };
const scope = { organizationId: id.organization, locationId: id.location, valetSessionId: id.session };
const bytes = Buffer.from([255, 216, 255, 217, 42]);

function harness(organizationRequired: boolean, locationOverride: boolean | null, opts: {
  marker?: boolean;
  state?: string;
  candidate?: boolean;
  readFails?: boolean;
} = {}) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      calls.push(sql);
      return { rows: [] };
    }
    if (sql.includes("FROM users")) return { rows: [{ status: "ACTIVE" }] };
    if (sql.includes("FROM organization_memberships"))
      return { rows: [{ id: id.membership, role: "VALET_EMPLOYEE", status: "ACTIVE" }] };
    if (sql.includes("AS organization_status"))
      return { rows: [{ organization_status: "ACTIVE", location_status: "ACTIVE" }] };
    if (sql.includes("FROM membership_location_access"))
      return { rows: [{ allowed: true }] };
    if (sql.includes("FROM valet_sessions AS s")) return { rows: [{
      organization_id: id.organization,
      location_id: id.location,
      state: opts.state ?? "CHECKING_IN",
      check_in_condition_completed_at: opts.marker ? new Date() : null,
      check_in_condition_completed_by_membership_id: opts.marker ? id.membership : null,
      check_in_photos_required: organizationRequired,
      check_in_photos_required_override: locationOverride,
    }] };
    if (sql.includes("FROM vehicle_photo_verifications AS v")) {
      calls.push("SELECT_CANDIDATES");
      return { rows: opts.candidate === false ? [] : [{
        photo_id: id.photo,
        operation_id: id.operation,
        attempt_id: id.attempt,
        captured_by_membership_id: id.membership,
        object_key: `condition-photo/${id.operation}/${id.attempt}`,
        bucket_alias: "test_private",
        object_version: "version-1",
        content_sha256: createHash("sha256").update(bytes).digest(),
        byte_size: bytes.length,
      }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const pool = { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as unknown as PostgresPool;
  const readExact = vi.fn(async () => {
    calls.push("READ_S3");
    if (opts.readFails) throw new Error("NoSuchKey");
    return { bytes: Buffer.from(bytes), version: "version-1" };
  });
  const store = { readExact } as unknown as PrivatePhotoStore;
  return { calls, query, pool, store, readExact };
}

describe("P3 authorized preflight and locked Check-In guard", () => {
  it.each([
    [false, null],
    [true, false],
  ] as const)("policy optional (organization=%s, location=%s) never reads S3", async (org, loc) => {
    const h = harness(org, loc);
    const result = await createCheckInPhotoPreflight(h.pool, h.store, "test_private")(request);
    expect(result.receipt).toBeUndefined();
    expect(h.readExact).not.toHaveBeenCalled();
    expect(h.calls).toEqual(["BEGIN", "COMMIT"]);
  });

  it("required photo reads private bytes only after authorized read COMMIT", async () => {
    const h = harness(true, null);
    const receipt = await createCheckInPhotoPreflight(h.pool, h.store, "test_private")(request);
    expect(receipt.receipt).toBeDefined();
    expect(h.calls).toEqual(["BEGIN", "SELECT_CANDIDATES", "COMMIT", "READ_S3"]);
    expect(h.readExact).toHaveBeenCalledWith({
      key: `condition-photo/${id.operation}/${id.attempt}`,
      version: "version-1",
    }, expect.any(Number));
  });

  it("historical marker replay and non-Checking-In states skip object reads", async () => {
    for (const opts of [{ marker: true }, { state: "CANCELLED" }]) {
      const h = harness(true, null, opts);
      const result = await createCheckInPhotoPreflight(
        h.pool, h.store, "test_private", true,
      )(request);
      expect(result.receipt).toBeUndefined();
      expect(h.readExact).not.toHaveBeenCalled();
    }
  });

  it("missing, corrupt or unavailable provider results cannot yield proof", async () => {
    for (const opts of [{ candidate: false }, { readFails: true }]) {
      const h = harness(true, true, opts);
      const result = await createCheckInPhotoPreflight(h.pool, h.store, "test_private")(request);
      expect(result.receipt).toBeUndefined();
    }
  });

  it("the locked guard honors current required/optional override and denies forged proof", async () => {
    const fakeTx = (required: boolean, override: boolean | null) => ({
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM valet_sessions AS session")) return { rows: [{
          check_in_condition_completed_at: new Date(),
          check_in_condition_completed_by_membership_id: id.membership,
          check_in_photos_required: required,
          check_in_photos_required_override: override,
        }] };
        throw new Error("Unexpected verification query");
      }),
    }) as unknown as PostgresTransaction;
    const optional = await evaluateLockedCheckInConditionGuard(fakeTx(true, false), scope);
    expect(optional.satisfied).toBe(true);
    expect(optional.qualifyingPhotoPresent).toBe(false);
    const required = await evaluateLockedCheckInConditionGuard(fakeTx(false, true), scope, {
      requestNonce: "forged-request-bound-nonce",
      receipt: { kind: "TRUSTED_CONDITION_PHOTO_RECEIPT" },
    });
    expect(required.markerComplete).toBe(true);
    expect(required.satisfied).toBe(false);
    expect(required.qualifyingPhotoPresent).toBe(false);
  });
});
