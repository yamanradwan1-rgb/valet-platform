import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../src/modules/dispatch/dispatch-transaction";
import { lockReleaseEligibleHandoffVerification } from "../src/modules/retrieval/handoff-release-guard";
import { lockHandoffSession } from "../src/modules/retrieval/handoff-locks";
import { HandoffTestContext } from "./handoff-test-context";

const context = new HandoffTestContext("command");

function differentPickupCode(pickupCode: string): string {
  return pickupCode === "0000" ? "0001" : "0000";
}

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006F secure handoff commands", () => {
  it("explicitly initiates HANDOFF_PENDING without advancing Retrieval work", async () => {
    const fixture = await context.createHandoffFixture();
    const result = await context.initiate(fixture);
    expect(result).toMatchObject({
      sessionId: fixture.sessionId,
      sessionVersion: 8,
      state: "HANDOFF_PENDING",
      taskId: fixture.retrievalTaskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    });
    const effects = await context.handoffEffects(fixture);
    expect(effects.projection).toMatchObject({
      request_status: "ACCEPTED",
      session_state: "HANDOFF_PENDING",
      session_version: 8,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    expect(effects.projection.handoff_pending_at).toEqual(
      new Date(result.handoffPendingAt),
    );
    expect(effects.projection.ready_at).not.toBeNull();
    expect(effects.audits).toHaveLength(1);
  });

  it("issues and verifies a four-digit pickup code without plaintext persistence", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const issuedAt = Date.now();
    const material = await context.issue(fixture, "PICKUP_CODE");
    expect(material).toMatchObject({
      method: "PICKUP_CODE",
      pickupCode: expect.stringMatching(/^\d{4}$/),
      state: "HANDOFF_PENDING",
      valetSessionId: fixture.sessionId,
    });
    if (material.method !== "PICKUP_CODE")
      throw new Error("Unexpected method.");
    expect(new Date(material.expiresAt).getTime() - issuedAt).toBeGreaterThan(
      590_000,
    );
    expect(new Date(material.expiresAt).getTime() - issuedAt).toBeLessThan(
      610_000,
    );
    const pickupCode = material.pickupCode;
    let effects = await context.handoffEffects(fixture);
    expect(effects.verifications).toHaveLength(1);
    expect(effects.verifications[0]).toMatchObject({
      attempt_count: 0,
      consumed_at: null,
      max_attempts: 5,
      method: "PICKUP_CODE",
      verified_at: null,
    });
    expect(effects.verifications[0]?.secret_hash).toMatch(
      /^hv1\.[A-Za-z0-9_-]{43}$/,
    );
    expect(effects.verifications[0]?.secret_hash).not.toContain(pickupCode);
    const verified = await context.verify(fixture, "PICKUP_CODE", pickupCode);
    expect(verified).toMatchObject({
      method: "PICKUP_CODE",
      sessionVersion: 9,
      state: "HANDOFF_PENDING",
      verificationStatus: "VERIFIED",
    });
    effects = await context.handoffEffects(fixture);
    expect(effects.projection).toMatchObject({
      request_status: "ACCEPTED",
      session_state: "HANDOFF_PENDING",
      session_version: 9,
      task_status: "IN_PROGRESS",
    });
    expect(effects.verifications[0]).toMatchObject({ consumed_at: null });
    expect(effects.verifications[0]?.verified_at).not.toBeNull();
    expect(effects.audits.map((audit) => audit.event_type)).toEqual([
      "VALET_SESSION_HANDOFF_INITIATED",
      "HANDOFF_VERIFICATION_ISSUED",
      "HANDOFF_VERIFIED",
    ]);
    expect(JSON.stringify(effects.audits)).not.toContain(pickupCode);
  });

  it("supports opaque Dynamic QR material with a shorter expiry", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const issuedAt = Date.now();
    const material = await context.issue(fixture, "DYNAMIC_QR");
    expect(material).toMatchObject({
      method: "DYNAMIC_QR",
      qrPayload: expect.stringMatching(/^vhq1\.[A-Za-z0-9_-]{43}$/),
    });
    expect(new Date(material.expiresAt).getTime() - issuedAt).toBeGreaterThan(
      110_000,
    );
    expect(new Date(material.expiresAt).getTime() - issuedAt).toBeLessThan(
      130_000,
    );
    await expect(
      context.verify(
        fixture,
        "DYNAMIC_QR",
        material.method === "DYNAMIC_QR" ? material.qrPayload : "",
      ),
    ).resolves.toMatchObject({ method: "DYNAMIC_QR", sessionVersion: 9 });
  });

  it("consumes a proof on the fifth invalid attempt", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const material = await context.issue(fixture, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE")
      throw new Error("Unexpected method.");
    const invalidCode = differentPickupCode(material.pickupCode);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(
        context.verify(fixture, "PICKUP_CODE", invalidCode),
      ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });
      const row = (await context.handoffEffects(fixture)).verifications[0];
      expect(row?.attempt_count).toBe(attempt);
      expect(row?.consumed_at === null).toBe(attempt < 5);
    }
    expect(
      (await context.handoffEffects(fixture)).projection.session_version,
    ).toBe(8);
  });

  it("serializes concurrent issue attempts to one active material", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const settled = await Promise.allSettled([
      context.issue(fixture, "PICKUP_CODE"),
      context.issue(fixture, "PICKUP_CODE"),
    ]);
    expect(
      settled.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      settled.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect((await context.handoffEffects(fixture)).verifications).toHaveLength(
      1,
    );
  });

  it("allows supervisor override only after explicit initiation", async () => {
    const fixture = await context.createHandoffFixture();
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    await expect(
      context.overrideHandoff(fixture, supervisor.userId, 7),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(
      (await context.handoffEffects(fixture)).projection.session_state,
    ).toBe("READY");
    await context.initiate(fixture);
    await expect(
      context.overrideHandoff(fixture, supervisor.userId, 8),
    ).resolves.toMatchObject({
      method: "SUPERVISOR_OVERRIDE",
      sessionVersion: 9,
      state: "HANDOFF_PENDING",
    });
    expect(
      (await context.handoffEffects(fixture)).verifications[0],
    ).toMatchObject({
      consumed_at: null,
      method: "SUPERVISOR_OVERRIDE",
      override_reason: "Guest identity confirmed by supervisor",
      secret_hash: null,
    });
  });

  it("denies manager override and conceals standard verification from non-owner", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const manager = await context.addMember(fixture, "LOCATION_MANAGER", false);
    const employee = await context.addMember(fixture);
    await expect(
      context.overrideHandoff(fixture, manager.userId, 8),
    ).rejects.toMatchObject({ code: "HANDOFF_OVERRIDE_NOT_ALLOWED" });
    const material = await context.issue(fixture, "PICKUP_CODE");
    await expect(
      context.verify(
        { ...fixture, userId: employee.userId },
        "PICKUP_CODE",
        material.method === "PICKUP_CODE" ? material.pickupCode : "",
      ),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
  });

  it("aborts to READY, consumes proof, and preserves Task and Request", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    await context.issue(fixture, "DYNAMIC_QR");
    await expect(context.abort(fixture)).resolves.toMatchObject({
      sessionVersion: 9,
      state: "READY",
      taskStatus: "IN_PROGRESS",
    });
    const effects = await context.handoffEffects(fixture);
    expect(effects.projection).toMatchObject({
      handoff_pending_at: null,
      request_status: "ACCEPTED",
      session_state: "READY",
      task_status: "IN_PROGRESS",
    });
    expect(effects.verifications[0]?.consumed_at).not.toBeNull();
  });

  it("makes the VAL-006G release guard re-evaluate current method policy", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const material = await context.issue(fixture, "PICKUP_CODE");
    await context.verify(
      fixture,
      "PICKUP_CODE",
      material.method === "PICKUP_CODE" ? material.pickupCode : "",
    );
    const eligible = await inDispatchTransaction(
      context.runtimePool,
      async (transaction) =>
        lockReleaseEligibleHandoffVerification(
          transaction,
          await lockHandoffSession(transaction, fixture.sessionId),
          await loadDispatchOperationTime(transaction),
        ),
    );
    expect(eligible?.method).toBe("PICKUP_CODE");
    await context.adminPool.query(
      `UPDATE organizations SET handoff_standard_method_policy = 'DYNAMIC_QR'
       WHERE id = $1`,
      [fixture.organizationId],
    );
    const rejected = await inDispatchTransaction(
      context.runtimePool,
      async (transaction) =>
        lockReleaseEligibleHandoffVerification(
          transaction,
          await lockHandoffSession(transaction, fixture.sessionId),
          await loadDispatchOperationTime(transaction),
        ),
    );
    expect(rejected).toBeUndefined();
  });
});
