import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { inDispatchTransaction } from "../src/modules/dispatch/dispatch-transaction";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { createCompleteHandoffExecutor } from "../src/modules/retrieval/complete-handoff-command";
import { requestGuestRetrieval } from "../src/modules/retrieval/guest-retrieval-request-command";
import { createInitiateHandoffExecutor } from "../src/modules/retrieval/initiate-handoff-command";
import { HandoffService } from "../src/modules/retrieval/handoff.service";
import { createMarkReadyCommandExecutor } from "../src/modules/retrieval/mark-ready-command";
import { createStartRetrievalCommandExecutor } from "../src/modules/retrieval/start-retrieval-command";
import { createVerifyHandoffExecutor } from "../src/modules/retrieval/verify-handoff-command";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { resolveAndLockGuestAccessSession } from "../src/modules/valet-sessions/guest-access-session-resolution";
import { ConfirmParkedTestContext } from "./confirm-parked-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

const context = new ConfirmParkedTestContext("postbindingdownstream");
let priorAntiAbuseSecret: string | undefined;
let priorHandoffSecret: string | undefined;

beforeAll(async () => {
  priorAntiAbuseSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  priorHandoffSecret = process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
  process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
  await context.setup();
}, 120_000);

afterAll(async () => {
  try {
    await context.teardown();
  } finally {
    if (priorAntiAbuseSecret === undefined) {
      delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    } else {
      process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = priorAntiAbuseSecret;
    }
    if (priorHandoffSecret === undefined) {
      delete process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
    } else {
      process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL = priorHandoffSecret;
    }
  }
}, 60_000);

async function sessionProjection(sessionId: string) {
  const result = await context.adminPool.query<{
    key_slot_id: string | null;
    parking_spot_id: string | null;
    session_state: string;
    session_version: number;
  }>(
    `SELECT state::text AS session_state, version AS session_version,
            key_slot_id::text, parking_spot_id::text
     FROM valet_sessions WHERE id = $1`,
    [sessionId],
  );
  return result.rows[0]!;
}

async function custodyHistory(sessionId: string) {
  const result = await context.adminPool.query<{
    event_type: string;
    key_slot_id: string | null;
  }>(
    `SELECT event_type::text, key_slot_id::text FROM key_custody_events
     WHERE valet_session_id = $1 ORDER BY occurred_at, created_at, id`,
    [sessionId],
  );
  return result.rows;
}

function orderedIdFactory(seed: number) {
  let counter = seed;
  return () => {
    const suffix = counter.toString(16).padStart(12, "0");
    counter += 1;
    return `00000000-0000-0000-0000-${suffix}`;
  };
}

describe("DEC-068 downstream continuity after post-Parking binding", () => {
  it("reaches retrieval CHECKED_OUT and release RELEASED from the bound slot", async () => {
    const fixture = await context.createPostBindingFixture();
    const parked = await context.confirm(
      fixture,
      { sessionVersion: 2, taskVersion: 4 },
      {
        auditEventIdFactory: orderedIdFactory(1),
        custodyEventIdFactory: orderedIdFactory(1),
      },
    );
    expect(parked.sessionVersion).toBe(3);
    expect((await sessionProjection(fixture.sessionId)).key_slot_id).toBe(
      fixture.keySlotId,
    );

    const rawToken = randomBytes(32).toString("base64url");
    await context.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash = $2,
           customer_access_expires_at = transaction_timestamp() + interval '1 hour',
           customer_access_revoked_at = NULL
       WHERE id = $1`,
      [fixture.sessionId, hashGuestAccessToken(rawToken)],
    );
    const requested = await inDispatchTransaction(
      context.runtimePool,
      async (transaction) =>
        requestGuestRetrieval(
          transaction,
          await resolveAndLockGuestAccessSession(transaction, rawToken),
          syntheticStaffPushPolicy.employeeRetrievalRequested,
        ),
    );
    expect(requested.state).toBe("REQUESTED");

    const retrievalTaskId = (
      await context.adminPool.query<{ id: string }>(
        `SELECT id::text AS id FROM tasks
         WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL'
           AND status = 'QUEUED'`,
        [fixture.sessionId],
      )
    ).rows[0]!.id;
    const assigned = await createAssignTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        taskId: retrievalTaskId,
      },
    );
    const accepted = await createAcceptTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: retrievalTaskId,
      },
    );
    const started = await createStartRetrievalCommandExecutor(
      context.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: requested.version,
      expectedTaskVersion: accepted.version,
      sessionId: fixture.sessionId,
    });
    expect(await sessionProjection(fixture.sessionId)).toMatchObject({
      key_slot_id: fixture.keySlotId,
      parking_spot_id: null,
      session_state: "RETRIEVING",
    });
    expect((await custodyHistory(fixture.sessionId)).at(-1)?.event_type).toBe(
      "CHECKED_OUT",
    );

    const ready = await createMarkReadyCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: started.sessionVersion,
      sessionId: fixture.sessionId,
    });
    const initiated = await createInitiateHandoffExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: ready.sessionVersion,
      sessionId: fixture.sessionId,
    });
    const antiAbuse = new AntiAbuseService(
      context.runtimePool,
      new AntiAbuseKeyDeriver(),
    );
    const reservation = await antiAbuse.reserve(
      antiAbuse.key("v1:guest-client-address", `test-${fixture.sessionId}`),
      60,
    );
    if (!reservation.allowed) throw new Error("Test reservation was limited.");
    const handoffs = new HandoffService(
      context.runtimePool,
      antiAbuse,
      new GuestAccessService(context.runtimePool),
    );
    const material = await handoffs.issueGuestMaterial(
      reservation.reservation,
      rawToken,
      "PICKUP_CODE",
      false,
    );
    if (material.method !== "PICKUP_CODE") {
      throw new Error("Unexpected handoff method was issued.");
    }
    const verified = await createVerifyHandoffExecutor(
      context.runtimePool,
      antiAbuse,
    )({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: initiated.sessionVersion,
      material: material.pickupCode,
      method: "PICKUP_CODE",
      sessionId: fixture.sessionId,
    });
    const completed = await createCompleteHandoffExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: verified.sessionVersion,
      sessionId: fixture.sessionId,
    });
    expect(completed).toMatchObject({ state: "COMPLETED" });
    expect(await sessionProjection(fixture.sessionId)).toMatchObject({
      key_slot_id: null,
      session_state: "COMPLETED",
    });
    expect(
      (await custodyHistory(fixture.sessionId)).map((e) => e.event_type),
    ).toEqual(["SLOT_ASSIGNED", "RETURNED_TO_SLOT", "CHECKED_OUT", "RELEASED"]);
  });
});
