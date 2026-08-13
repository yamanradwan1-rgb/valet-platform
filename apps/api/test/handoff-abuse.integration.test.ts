import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HandoffTestContext } from "./handoff-test-context";

const context = new HandoffTestContext("abuse");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function differentPickupCode(pickupCode: string): string {
  return pickupCode === "0000" ? "0001" : "0000";
}

describe("VAL-006F handoff anti-abuse", () => {
  it("does not count security-unavailable issuance as a created proof", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const validSecret = process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
    if (validSecret === undefined) throw new Error("Missing test secret.");
    const limiter = context.antiAbuse();
    const issuanceKey = limiter.key(
      "v1:handoff-issuance-session",
      fixture.sessionId,
    );
    const perimeterKey = limiter.key(
      "v1:guest-client-address",
      `test-${fixture.sessionId}`,
    );

    try {
      for (const invalidSecret of [
        undefined,
        "malformed",
        undefined,
        "malformed",
        undefined,
        "malformed",
      ]) {
        if (invalidSecret === undefined) {
          delete process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
        } else {
          process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL = invalidSecret;
        }
        await expect(
          context.issue(fixture, "PICKUP_CODE"),
        ).rejects.toMatchObject({ code: "HANDOFF_SECURITY_UNAVAILABLE" });
      }
    } finally {
      process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL = validSecret;
    }

    const before = await context.handoffEffects(fixture);
    expect(before.verifications).toHaveLength(0);
    expect(
      before.audits.filter(({ event_type }) =>
        [
          "HANDOFF_VERIFICATION_ISSUED",
          "HANDOFF_VERIFICATION_ROTATED",
        ].includes(event_type),
      ),
    ).toHaveLength(0);
    const limiterRows = await context.adminPool.query<{
      ignored_perimeter_count: number;
      issuance_count: number;
    }>(
      `SELECT
         count(*) FILTER (
           WHERE scope = $1 AND key_hash = $2
         )::integer AS issuance_count,
         count(*) FILTER (
           WHERE scope = $3 AND key_hash = $4 AND state = 'IGNORED'
         )::integer AS ignored_perimeter_count
       FROM anti_abuse_events`,
      [
        issuanceKey.scope,
        issuanceKey.keyHash,
        perimeterKey.scope,
        perimeterKey.keyHash,
      ],
    );
    expect(limiterRows.rows[0]).toEqual({
      ignored_perimeter_count: 6,
      issuance_count: 0,
    });

    await expect(context.issue(fixture, "PICKUP_CODE")).resolves.toMatchObject({
      method: "PICKUP_CODE",
      pickupCode: expect.stringMatching(/^\d{4}$/),
    });
    const after = await context.handoffEffects(fixture);
    expect(after.verifications).toHaveLength(1);
    expect(
      after.audits.filter(
        ({ event_type }) => event_type === "HANDOFF_VERIFICATION_ISSUED",
      ),
    ).toHaveLength(1);
    const issuanceCount = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM anti_abuse_events WHERE scope = $1 AND key_hash = $2`,
      [issuanceKey.scope, issuanceKey.keyHash],
    );
    expect(issuanceCount.rows[0]?.count).toBe(1);
  });

  it("counts a method-mismatched submission against the active proof", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    await context.issue(fixture, "PICKUP_CODE");
    await expect(
      context.verify(fixture, "DYNAMIC_QR", `vhq1.${"A".repeat(43)}`),
    ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });
    expect(
      (await context.handoffEffects(fixture)).verifications[0]?.attempt_count,
    ).toBe(1);
  });

  it("enforces durable issuance and failed-proof limits across rotations", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    let invalidCode = "";
    for (let issuance = 0; issuance < 5; issuance += 1) {
      const material = await context.issue(
        fixture,
        "PICKUP_CODE",
        issuance > 0,
      );
      if (material.method !== "PICKUP_CODE")
        throw new Error("Unexpected method.");
      invalidCode = differentPickupCode(material.pickupCode);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expect(
          context.verify(fixture, "PICKUP_CODE", invalidCode),
        ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });
      }
    }
    await expect(
      context.verify(fixture, "PICKUP_CODE", invalidCode),
    ).rejects.toMatchObject({
      code: "HANDOFF_VERIFICATION_RATE_LIMITED",
      retryAfter: expect.any(Number),
    });
    await expect(
      context.issue(fixture, "PICKUP_CODE", true),
    ).rejects.toMatchObject({
      code: "HANDOFF_VERIFICATION_RATE_LIMITED",
      retryAfter: expect.any(Number),
    });
  });
});
