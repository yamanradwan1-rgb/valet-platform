import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { managementAlertTimingPreferenceDefaults as defaults } from "@valet/contracts";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  blockAlertTimingPreference,
  releaseAlertTimingBlock,
  waitForAlertTimingAdvisoryWait,
} from "./management-alert-timing-blocked-lane";

const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function subject() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return {
    user,
    membership,
    auth,
    path: `/v1/staff/management/organizations/${membership.organizationId}/locations/${location.locationId}/alert-timing-preferences`,
  };
}

async function blockedWrite(
  actor: Awaited<ReturnType<typeof subject>>,
  expectedRevision: number,
  alt02QueueSeconds: number,
) {
  const blocker = await blockAlertTimingPreference(
    fixture,
    actor.membership.organizationId,
    actor.user.id,
  );
  let released = false;
  let pending: ReturnType<typeof fixture.managementPut> | undefined;
  try {
    pending = fixture.managementPut(actor.path, actor.auth.accessToken, {
      expectedRevision,
      values: { ...defaults, alt02QueueSeconds },
    });
    void pending.catch(() => undefined);
    // The API transaction has started and is waiting for the preference lock.
    await waitForAlertTimingAdvisoryWait(fixture, "management-alert-timing:");
    const clock = await blocker.query<{ now: Date }>(
      "SELECT clock_timestamp() AS now",
    );
    const afterStartBeforeRelease = clock.rows[0]!.now;
    // Cross PostgreSQL timestamptz(3) precision deterministically.
    await new Promise((resolve) => setTimeout(resolve, 40));
    await releaseAlertTimingBlock(blocker);
    released = true;
    const result = await pending;
    expect(result.status).toBe(200);
    const updatedAt = new Date(String(result.body?.updatedAt));
    expect(updatedAt.getTime()).toBeGreaterThan(
      afterStartBeforeRelease.getTime(),
    );
    const audit = await fixture.query<{ occurred_at: Date }>(
      `SELECT occurred_at FROM audit_events
       WHERE organization_id=$1 AND entity_id=$2
         AND event_type='MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED'
       ORDER BY occurred_at DESC LIMIT 1`,
      [actor.membership.organizationId, actor.user.id],
    );
    expect(audit.rows[0]?.occurred_at).toEqual(updatedAt);
    return updatedAt;
  } finally {
    if (!released) {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
    await pending?.catch(() => undefined);
  }
}

describe("Issue #414 preference timestamp is write-time PG17 clock (MFA bypass OFF)", () => {
  it("never backdates first INSERT after the earlier transaction waits for a lock", async () => {
    const actor = await subject();
    const result = await blockedWrite(actor, 0, 75);
    const row = await fixture.query<{ updated_at: Date }>(
      `SELECT updated_at FROM management_alert_timing_preferences
       WHERE organization_id=$1 AND user_id=$2`,
      [actor.membership.organizationId, actor.user.id],
    );
    expect(row.rows[0]?.updated_at).toEqual(result);
  });

  it("never regresses UPDATE timestamp or its audit time after a lock delay", async () => {
    const actor = await subject();
    const initial = await fixture.managementPut(
      actor.path,
      actor.auth.accessToken,
      {
        expectedRevision: 0,
        values: { ...defaults, alt02QueueSeconds: 70 },
      },
    );
    expect(initial.status).toBe(200);
    const firstTimestamp = new Date(String(initial.body?.updatedAt));
    const latestTimestamp = await blockedWrite(actor, 1, 90);
    expect(latestTimestamp.getTime()).toBeGreaterThan(firstTimestamp.getTime());
    const row = await fixture.query<{ revision: number; updated_at: Date }>(
      `SELECT revision, updated_at FROM management_alert_timing_preferences
       WHERE organization_id=$1 AND user_id=$2`,
      [actor.membership.organizationId, actor.user.id],
    );
    expect(row.rows[0]).toEqual({ revision: 2, updated_at: latestTimestamp });
  });
});
