import { describe, expect, it, vi } from "vitest";

import { resolveEligibleGuestPushDelivery } from "../src/modules/guest-push/guest-push-eligibility-repository";

const claim = {
  attemptCount: 1,
  deliveryId: "11111111-1111-4111-8111-111111111111",
  leaseToken: "22222222-2222-4222-8222-222222222222",
  maxAttempts: 4,
  reclaimed: false,
} as const;

function fakePool(rows: unknown[] = []) {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (sql.includes("guest_push_resolve_eligible_v1")) {
      return { rowCount: rows.length, rows };
    }
    throw new Error("Unexpected eligibility query.");
  });
  return {
    pool: { query } as never,
    query,
    statements,
  };
}

describe("Guest push final eligibility authority", () => {
  it("fails closed when the authoritative resolver returns no eligible row", async () => {
    const fixture = fakePool();
    await expect(
      resolveEligibleGuestPushDelivery(fixture.pool, claim, 1),
    ).resolves.toBeUndefined();
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining("guest_push_resolve_eligible_v1($1,$2,$3)"),
      [claim.deliveryId, claim.leaseToken, 1],
    );
  });

  it("maps only the bounded transport material returned by the resolver", async () => {
    const fixture = fakePool([
      {
        auth_secret: "auth",
        endpoint: "https://fcm.googleapis.com/fcm/send/opaque",
        intent_id: "33333333-3333-4333-8333-333333333333",
        locale: "en",
        p256dh: "key",
        registration_id: "44444444-4444-4444-8444-444444444444",
        remaining_lifetime_milliseconds: 30_000,
      },
    ]);
    await expect(
      resolveEligibleGuestPushDelivery(fixture.pool, claim, 1),
    ).resolves.toMatchObject({
      deliveryId: claim.deliveryId,
      intentId: "33333333-3333-4333-8333-333333333333",
      registrationId: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("does not bypass the DB authority function with direct secret-table reads", async () => {
    const fixture = fakePool();
    await resolveEligibleGuestPushDelivery(fixture.pool, claim, 1);

    const sql = fixture.statements[0] ?? "";
    expect(sql).toContain("public.guest_push_resolve_eligible_v1");
    expect(sql).not.toContain("guest_push_registrations");
    expect(sql).not.toContain("customer_access_expires_at");
  });
});
