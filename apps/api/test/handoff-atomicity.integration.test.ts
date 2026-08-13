import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HandoffTestContext } from "./handoff-test-context";

const context = new HandoffTestContext("atomicity");

type RejectedEvent =
  | "HANDOFF_VERIFICATION_FAILED"
  | "HANDOFF_VERIFIED"
  | "VALET_SESSION_HANDOFF_INITIATED";

async function rejectAudit(
  eventType: RejectedEvent,
  operation: () => Promise<unknown>,
): Promise<void> {
  await context.adminPool.query(
    `CREATE FUNCTION reject_handoff_audit_for_test()
     RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       IF NEW.event_type = '${eventType}' THEN
         RAISE EXCEPTION 'reject handoff audit';
       END IF;
       RETURN NEW;
     END;
     $$;
     CREATE TRIGGER reject_handoff_audit_for_test
     BEFORE INSERT ON audit_events
     FOR EACH ROW EXECUTE FUNCTION reject_handoff_audit_for_test()`,
  );
  try {
    await operation();
  } finally {
    await context.adminPool.query(
      `DROP TRIGGER reject_handoff_audit_for_test ON audit_events;
       DROP FUNCTION reject_handoff_audit_for_test()`,
    );
  }
}

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006F secure handoff atomicity", () => {
  it("rolls back initiation when its required AuditEvent cannot append", async () => {
    const fixture = await context.createHandoffFixture();
    await expect(
      rejectAudit("VALET_SESSION_HANDOFF_INITIATED", () =>
        context.initiate(fixture),
      ),
    ).rejects.toThrow();
    const effects = await context.handoffEffects(fixture);
    expect(effects.projection).toMatchObject({
      handoff_pending_at: null,
      session_state: "READY",
      session_version: 7,
    });
    expect(effects.audits).toHaveLength(0);
  });

  it("rolls back a failed-proof attempt when its audit cannot append", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const material = await context.issue(fixture, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE")
      throw new Error("Unexpected method.");
    const invalidCode = material.pickupCode === "0000" ? "0001" : "0000";
    await expect(
      rejectAudit("HANDOFF_VERIFICATION_FAILED", () =>
        context.verify(fixture, "PICKUP_CODE", invalidCode),
      ),
    ).rejects.toThrow();
    expect(
      (await context.handoffEffects(fixture)).verifications[0]?.attempt_count,
    ).toBe(0);
    await expect(
      context.verify(fixture, "PICKUP_CODE", invalidCode),
    ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });
    expect(
      (await context.handoffEffects(fixture)).verifications[0]?.attempt_count,
    ).toBe(1);
  });

  it("rolls back successful verification when its audit cannot append", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const material = await context.issue(fixture, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE")
      throw new Error("Unexpected method.");
    await expect(
      rejectAudit("HANDOFF_VERIFIED", () =>
        context.verify(fixture, "PICKUP_CODE", material.pickupCode),
      ),
    ).rejects.toThrow();
    const effects = await context.handoffEffects(fixture);
    expect(effects.projection.session_version).toBe(8);
    expect(effects.verifications[0]?.verified_at).toBeNull();
  });
});
