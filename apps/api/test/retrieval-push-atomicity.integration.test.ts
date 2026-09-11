import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inDispatchTransaction } from "../src/modules/dispatch/dispatch-transaction";
import { persistRetrievalPushAttention } from "../src/modules/staff-push/retrieval-push-attention-writer";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

const context = new RetrievalPushTestContext("atomicity");
const policy = syntheticStaffPushPolicy.employeeRetrievalRequested;

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function expectCompleteRollback(sessionId: string): Promise<void> {
  expect(await context.retrievalEffects(sessionId)).toEqual({
    audit_count: 0,
    delivery_count: 0,
    dispatch_count: 0,
    intent_count: 0,
    request_count: 0,
    session_state: "PARKED",
    task_count: 0,
  });
}

describe("MOB-020C retrieval attention atomicity", () => {
  it("rolls back every domain and attention write when intent INSERT fails", async () => {
    const fixture = await context.createGuestParkedFixture();
    const removeFailure =
      await context.installFailureTrigger("staff_push_intents");
    try {
      await expect(context.request(fixture)).rejects.toThrow(
        "synthetic MOB-020C persistence failure",
      );
    } finally {
      await removeFailure();
    }
    await expectCompleteRollback(fixture.sessionId);
  });

  it("rolls back every domain, intent and recipient write when delivery INSERT fails", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    const removeFailure = await context.installFailureTrigger(
      "staff_push_deliveries",
    );
    try {
      await expect(context.request(fixture)).rejects.toThrow(
        "synthetic MOB-020C persistence failure",
      );
    } finally {
      await removeFailure();
    }
    await expectCompleteRollback(fixture.sessionId);
  });

  it("commits domain, audit, intent and all eligible deliveries together", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    const second = await context.addMember(fixture, "VALET_SUPERVISOR");
    await context.addRegistration(second.userId);
    await context.request(fixture);
    expect(await context.retrievalEffects(fixture.sessionId)).toEqual({
      audit_count: 1,
      delivery_count: 2,
      dispatch_count: 1,
      intent_count: 1,
      request_count: 1,
      session_state: "REQUESTED",
      task_count: 1,
    });
  });

  it("refuses to create an intent for the completed PARKING task", async () => {
    const fixture = await context.createGuestParkedFixture();
    await expect(
      inDispatchTransaction(context.runtimePool, (transaction) =>
        persistRetrievalPushAttention(
          transaction,
          {
            locationId: fixture.locationId,
            organizationId: fixture.organizationId,
            taskId: fixture.taskId,
            valetSessionId: fixture.sessionId,
          },
          new Date(),
          policy,
        ),
      ),
    ).rejects.toThrow("Retrieval Push intent task invariant");
    expect(
      await context.adminPool.query(
        "SELECT 1 FROM staff_push_intents WHERE task_id = $1",
        [fixture.taskId],
      ),
    ).toMatchObject({ rowCount: 0 });
  });

  it.each([
    { assignee: true, status: "ASSIGNED" },
    { assignee: false, status: "CANCELLED" },
  ])("refuses a $status Retrieval task", async ({ assignee, status }) => {
    const dispatch = await context.createRetrievalDispatchFixture();
    await context.adminPool.query(
      `UPDATE tasks SET status = $2, current_assignee_membership_id = $3
       WHERE id = $1`,
      [
        dispatch.retrieval.taskId,
        status,
        assignee ? dispatch.fixture.membershipId : null,
      ],
    );
    await expect(
      inDispatchTransaction(context.runtimePool, (transaction) =>
        persistRetrievalPushAttention(
          transaction,
          {
            locationId: dispatch.fixture.locationId,
            organizationId: dispatch.fixture.organizationId,
            taskId: dispatch.retrieval.taskId,
            valetSessionId: dispatch.fixture.sessionId,
          },
          new Date(),
          policy,
        ),
      ),
    ).rejects.toThrow("Retrieval Push intent task invariant");
  });
});
