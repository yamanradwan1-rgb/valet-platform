import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type GuestParkedFixture,
  RetrievalPushTestContext,
} from "./retrieval-push-test-context";

const context = new RetrievalPushTestContext("eligibility");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function expectNoDelivery(fixture: GuestParkedFixture): Promise<void> {
  await context.request(fixture);
  expect(await context.retrievalEffects(fixture.sessionId)).toMatchObject({
    delivery_count: 0,
    intent_count: 1,
    task_count: 1,
  });
}

describe("MOB-020C write-side recipient eligibility", () => {
  it.each(["DISABLED", "SUPERSEDED", "PROVIDER_INVALID"] as const)(
    "excludes a %s registration",
    async (state) => {
      const fixture = await context.createGuestParkedFixture();
      await context.addRegistration(fixture.userId, { state });
      await expectNoDelivery(fixture);
    },
  );

  it("excludes a revoked Staff session", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId, { revoked: true });
    await expectNoDelivery(fixture);
  });

  it("excludes an absolute-expired Staff session", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId, { absoluteExpired: true });
    await expectNoDelivery(fixture);
  });

  it("excludes a disabled User", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.adminPool.query(
      "UPDATE users SET status = 'DISABLED' WHERE id = $1",
      [fixture.userId],
    );
    await expectNoDelivery(fixture);
  });

  it("excludes an inactive membership", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.adminPool.query(
      "UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1",
      [fixture.membershipId],
    );
    await expectNoDelivery(fixture);
  });

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "excludes unsupported role %s",
    async (role) => {
      const fixture = await context.createGuestParkedFixture();
      await context.addRegistration(fixture.userId);
      await context.adminPool.query(
        "UPDATE organization_memberships SET role = $2 WHERE id = $1",
        [fixture.membershipId, role],
      );
      await expectNoDelivery(fixture);
    },
  );

  it("excludes an inactive Organization", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.adminPool.query(
      "UPDATE organizations SET status = 'INACTIVE' WHERE id = $1",
      [fixture.organizationId],
    );
    await expectNoDelivery(fixture);
  });

  it("excludes a membership and registration from another Organization", async () => {
    const fixture = await context.createGuestParkedFixture();
    const foreign = await context.createFixture();
    await context.addRegistration(foreign.userId);
    await expectNoDelivery(fixture);
  });

  it("does not match a registration session to another User's membership", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addMember(fixture);
    const unrelated = await context.createFixture();
    await context.addRegistration(unrelated.userId);
    await expectNoDelivery(fixture);
  });

  it("excludes an inactive Task Location", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.adminPool.query(
      "UPDATE locations SET status = 'INACTIVE' WHERE id = $1",
      [fixture.locationId],
    );
    await expectNoDelivery(fixture);
  });

  it("excludes Staff without explicit access to the exact Task Location", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id = $1 AND location_id = $2`,
      [fixture.membershipId, fixture.locationId],
    );
    await expectNoDelivery(fixture);
  });

  it("does not substitute access to another Location", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.addLocation(fixture);
    await context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id = $1 AND location_id = $2`,
      [fixture.membershipId, fixture.locationId],
    );
    await expectNoDelivery(fixture);
  });

  it("excludes Staff with no Shift", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.adminPool.query(
      "DELETE FROM shifts WHERE membership_id = $1",
      [fixture.membershipId],
    );
    await expectNoDelivery(fixture);
  });

  it("excludes an ended Shift", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1`,
      [fixture.membershipId],
    );
    await expectNoDelivery(fixture);
  });

  it("does not substitute an ACTIVE Shift at another Location", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    const otherLocationId = await context.addLocation(fixture);
    await context.adminPool.query(
      "UPDATE shifts SET location_id = $2 WHERE membership_id = $1",
      [fixture.membershipId, otherLocationId],
    );
    await expectNoDelivery(fixture);
  });

  it("creates deliveries only for the eligible subset", async () => {
    const fixture = await context.createGuestParkedFixture();
    const eligible = await context.addRegistration(fixture.userId);
    const ineligible = await context.addMember(fixture);
    await context.addRegistration(ineligible.userId, { revoked: true });
    const foreignUserId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'synthetic', 'ACTIVE', transaction_timestamp())`,
      [foreignUserId, `${foreignUserId}@mob020c.test`],
    );
    await context.addRegistration(foreignUserId);
    await context.request(fixture);
    expect(await context.deliveryRegistrationIds(fixture.sessionId)).toEqual([
      eligible.registrationId,
    ]);
  });
});
