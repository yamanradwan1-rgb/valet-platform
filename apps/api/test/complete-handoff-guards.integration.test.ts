import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("guards");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006G release guards", () => {
  it("requires HANDOFF_PENDING", async () => {
    const fixture = await context.createHandoffFixture();
    await expect(
      context.complete(fixture, fixture.userId, 7),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("requires the Retrieval Task to remain IN_PROGRESS", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.adminPool.query(
      `UPDATE tasks SET status = 'ACCEPTED' WHERE id = $1`,
      [fixture.retrievalTaskId],
    );
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "TASK_INVALID_STATE",
    });
  });

  it("requires the RetrievalRequest to remain ACCEPTED", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.adminPool.query(
      `UPDATE retrieval_requests SET status = 'OPEN' WHERE id = $1`,
      [fixture.retrievalRequestId],
    );
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "RETRIEVAL_REQUEST_NOT_READY",
    });
  });

  it("rejects a stale expected session version before lifecycle guards", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await expect(
      context.complete(fixture, fixture.userId, 8),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("rejects missing or unverified proof without terminal mutation", async () => {
    const missing = await context.createHandoffFixture();
    await context.initiate(missing);
    await expect(
      context.complete(missing, missing.userId, 8),
    ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });

    const unverified = await context.createHandoffFixture();
    await context.initiate(unverified);
    await context.issue(unverified, "PICKUP_CODE");
    await expect(
      context.complete(unverified, unverified.userId, 8),
    ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });
    expect(
      (await context.releaseEffects(unverified)).projection.session_state,
    ).toBe("HANDOFF_PENDING");
  });

  it("rejects consumed proof", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.adminPool.query(
      `UPDATE handoff_verifications
       SET consumed_at = transaction_timestamp()
       WHERE valet_session_id = $1 AND consumed_at IS NULL`,
      [fixture.sessionId],
    );
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "HANDOFF_VERIFICATION_FAILED",
    });
  });

  it("rejects an expired verified Standard proof", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.adminPool.query(
      `UPDATE handoff_verifications
       SET expires_at = transaction_timestamp() - interval '1 second'
       WHERE valet_session_id = $1 AND consumed_at IS NULL`,
      [fixture.sessionId],
    );
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "HANDOFF_VERIFICATION_FAILED",
    });
  });

  it("fails closed when current policy disallows the verified method", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.setHandoffPolicy(fixture, "DYNAMIC_QR");
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "HANDOFF_VERIFICATION_FAILED",
    });
  });

  it("keeps a valid supervisor override eligible across Standard policy changes", async () => {
    const { fixture } = await context.prepareOverride();
    await context.setHandoffPolicy(fixture, "DYNAMIC_QR");
    await expect(context.complete(fixture)).resolves.toMatchObject({
      state: "COMPLETED",
    });
  });

  it("fails closed when custody no longer ends in CHECKED_OUT", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.adminPool.query(
      `INSERT INTO key_custody_events
         (id, organization_id, location_id, valet_session_id, key_slot_id,
          actor_membership_id, event_type, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'RETURNED_TO_SLOT',
               transaction_timestamp())`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.keySlotId,
        fixture.membershipId,
      ],
    );
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "KEY_CUSTODY_NOT_READY",
    });
  });
});
