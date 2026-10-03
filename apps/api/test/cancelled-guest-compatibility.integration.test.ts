import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createStaffValetSessionHarness } from "./staff-valet-session-harness";
import { createCancelCheckInCommandExecutor } from "../src/modules/valet-sessions/cancel-check-in-command";
import {
  createIssueGuestAccessCommandExecutor,
  createRevokeGuestAccessCommandExecutor,
  resolveGuestAccessWithDatabase,
} from "../src/modules/valet-sessions/guest-access-command";
import { resolveAndLockGuestAccessSession } from "../src/modules/valet-sessions/guest-access-session-resolution";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { RetrievalService } from "../src/modules/retrieval/retrieval.service";
import { PaymentProjectionService } from "../src/modules/payments/payment-projection.service";
import { PaymentMutationService } from "../src/modules/payments/payment-mutation.service";
import { HandoffService } from "../src/modules/retrieval/handoff.service";

describe("CANCELLED Guest compatibility", () => {
  const harness = createStaffValetSessionHarness();
  beforeAll(() => harness.start(), 120_000);
  afterAll(() => harness.close(), 60_000);
  async function target() {
    const { fixture } = await harness.fixtureWithToken();
    const { sessionId } = await harness.createSession(fixture);
    const shift = await harness.context.adminPool.query(
      "SELECT id FROM shifts WHERE membership_id=$1",
      [fixture.membershipId],
    );
    return {
      input: {
        authenticatedUserId: fixture.userId,
        sessionId,
        expectedVersion: 1,
        expectedShiftId: shift.rows[0].id as string,
      },
    };
  }
  async function facts(sessionId: string) {
    const session = await harness.context.adminPool.query(
      "SELECT * FROM valet_sessions WHERE id=$1",
      [sessionId],
    );
    const events = await harness.context.adminPool.query(
      "SELECT * FROM audit_events WHERE valet_session_id=$1 ORDER BY id",
      [sessionId],
    );
    return { session: session.rows[0], events: events.rows };
  }
  it("blocks unexpired/unrevoked Guest access before projection and denies issuance before token generation", async () => {
    const { input } = await target();
    const { rawToken: token } = await createIssueGuestAccessCommandExecutor(
      harness.context.runtimePool,
    )({
      authenticatedUserId: input.authenticatedUserId,
      valetSessionId: input.sessionId,
      intent: "ISSUE_OR_ROTATE",
    });
    const prior = await facts(input.sessionId);
    await createCancelCheckInCommandExecutor(harness.context.runtimePool)(
      input,
    );
    const before = await facts(input.sessionId);
    for (const column of [
      "customer_access_token_hash",
      "customer_access_expires_at",
      "customer_access_revoked_at",
    ])
      expect(before.session[column]).toEqual(prior.session[column]);
    expect(
      before.events.filter((event) =>
        event.event_type.startsWith("GUEST_ACCESS_"),
      ),
    ).toEqual(prior.events);
    expect(
      before.events.some(
        (event) => event.event_type === "GUEST_ACCESS_REVOKED",
      ),
    ).toBe(false);
    await expect(
      resolveGuestAccessWithDatabase(harness.context.runtimePool, token),
    ).rejects.toMatchObject({ code: "GUEST_ACCESS_INVALID" });
    const client = await harness.context.runtimePool.connect();
    try {
      await client.query("BEGIN");
      await expect(
        resolveAndLockGuestAccessSession(client, token),
      ).rejects.toMatchObject({ code: "GUEST_ACCESS_INVALID" });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    let generated = 0;
    const issue = createIssueGuestAccessCommandExecutor(
      harness.context.runtimePool,
      {
        tokenBytesFactory: () => {
          generated += 1;
          throw new Error("Must not generate");
        },
      },
    );
    const staff = {
      authenticatedUserId: input.authenticatedUserId,
      valetSessionId: input.sessionId,
    };
    await expect(
      issue({ ...staff, intent: "ISSUE_OR_ROTATE" }),
    ).rejects.toMatchObject({ code: "GUEST_ACCESS_INTENT_CONFLICT" });
    await expect(
      issue({
        ...staff,
        intent: "REISSUE_REVOKED",
        expectedRevokedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: "GUEST_ACCESS_INTENT_CONFLICT" });
    expect(generated).toBe(0);
    expect(await facts(input.sessionId)).toEqual(before);
    const access = new GuestAccessService(harness.context.runtimePool);
    const finalize = vi.fn(async () => undefined);
    const antiAbuse = { finalizeInTransaction: finalize } as never;
    const retrieval = new RetrievalService(
      harness.context.runtimePool,
      antiAbuse,
      access,
      { creationEnabled: false, employeeRetrievalRequested: false } as never,
    );
    const projection = new PaymentProjectionService(
      harness.context.runtimePool,
      antiAbuse,
      access,
    );
    const payment = new PaymentMutationService(
      harness.context.runtimePool,
      antiAbuse,
      access,
    );
    const handoff = new HandoffService(
      harness.context.runtimePool,
      antiAbuse,
      access,
    );
    for (const operation of [
      () => retrieval.requestGuestRetrieval({} as never, token),
      () => retrieval.cancelGuestRetrieval({} as never, token),
      () => projection.guest({} as never, token, input.sessionId),
      () => payment.guestTip({} as never, token, "1.000"),
      () =>
        handoff.issueGuestMaterial({} as never, token, "PICKUP_CODE", false),
    ])
      await expect(operation()).rejects.toMatchObject({
        code: "GUEST_ACCESS_INVALID",
      });
    expect(finalize).toHaveBeenCalledTimes(5);
    expect(await facts(input.sessionId)).toEqual(before);
    const revoke = createRevokeGuestAccessCommandExecutor(
      harness.context.runtimePool,
    );
    const revoked = await revoke(staff);
    expect(await revoke(staff)).toEqual(revoked);
    const explicitRevoke = await facts(input.sessionId);
    expect(explicitRevoke.session.state).toBe("CANCELLED");
    await expect(
      issue({
        ...staff,
        intent: "REISSUE_REVOKED",
        expectedRevokedAt: revoked.revokedAt,
      }),
    ).rejects.toMatchObject({ code: "GUEST_ACCESS_INTENT_CONFLICT" });
    expect(generated).toBe(0);
    expect(await facts(input.sessionId)).toEqual(explicitRevoke);
  });
});
