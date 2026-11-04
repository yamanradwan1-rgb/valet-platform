import { randomUUID } from "node:crypto";

import { managementAlertTimingPreferenceDefaults as defaults } from "@valet/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  blockAlertTimingPreference,
  releaseAlertTimingBlock,
  waitForAlertTimingAdvisoryWait,
} from "./management-alert-timing-blocked-lane";

const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(async () => {
  await fixture.query(
    "DROP TRIGGER IF EXISTS issue414_audit_failure ON audit_events",
  );
  await fixture.query("DROP FUNCTION IF EXISTS issue414_fail_audit()");
  await fixture.resetLimits();
});
afterAll(() => fixture.stop(), 60_000);

async function actor() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  const factor = await fixture.enrollAndAssure(auth);
  return {
    auth,
    factor,
    ...membership,
    ...location,
    user,
    path: `/v1/staff/management/organizations/${membership.organizationId}/locations/${location.locationId}/alert-timing-preferences`,
  };
}

async function contestedFirstSave(
  subject: Awaited<ReturnType<typeof actor>>,
  firstValues: Record<string, number>,
  secondValues: Record<string, number>,
) {
  const second = await fixture.nativeLogin(subject.user);
  expect(second.sessionId).not.toBe(subject.auth.sessionId);
  expect(second.accessToken).not.toBe(subject.auth.accessToken);
  expect((await fixture.stepUp(second, subject.factor.secret)).status).toBe(
    200,
  );
  const blocker = await blockAlertTimingPreference(
    fixture,
    subject.organizationId,
    subject.user.id,
  );
  let released = false;
  let firstRequest: ReturnType<typeof save> | undefined;
  let secondRequest: ReturnType<typeof save> | undefined;
  try {
    firstRequest = save(subject, firstValues);
    void firstRequest.catch(() => undefined);
    await waitForAlertTimingAdvisoryWait(fixture, "management-alert-timing:");
    secondRequest = fixture.managementPut(subject.path, second.accessToken, {
      expectedRevision: 0,
      values: secondValues,
    });
    void secondRequest.catch(() => undefined);
    // The second valid session is truly pending, but cannot pass the
    // accepted user-security lock while the first session holds it.
    await waitForAlertTimingAdvisoryWait(fixture, "staff-user-security:");
    await releaseAlertTimingBlock(blocker);
    released = true;
    return await Promise.all([firstRequest, secondRequest]);
  } finally {
    if (!released) {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
    await firstRequest?.catch(() => undefined);
    await secondRequest?.catch(() => undefined);
  }
}

function save(
  subject: Awaited<ReturnType<typeof actor>>,
  values: typeof defaults | Record<string, number>,
  expectedRevision = 0,
) {
  return fixture.managementPut(subject.path, subject.auth.accessToken, {
    expectedRevision,
    values,
  });
}

async function count(subject: Awaited<ReturnType<typeof actor>>) {
  const result = await fixture.query<{ preferences: number; events: number }>(
    `SELECT
       (SELECT count(*)::int FROM management_alert_timing_preferences
        WHERE organization_id=$1 AND user_id=$2) AS preferences,
       (SELECT count(*)::int FROM audit_events
        WHERE organization_id=$1
          AND event_type='MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED') AS events`,
    [subject.organizationId, subject.user.id],
  );
  return result.rows[0];
}

describe("Issue #414 preferences: real PostgreSQL concurrency and constraints", () => {
  it("converges duplicate concurrent first writes into one revision and audit", async () => {
    const subject = await actor();
    const values = { ...defaults, alt01GraceSeconds: 12 };
    const [first, second] = await contestedFirstSave(subject, values, values);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body).toEqual(second.body);
    expect(await count(subject)).toEqual({ preferences: 1, events: 1 });
  });

  it("rejects one of two conflicting concurrent first writes, and does not lose increments", async () => {
    const subject = await actor();
    const [first, second] = await contestedFirstSave(
      subject,
      { ...defaults, alt01GraceSeconds: 8 },
      { ...defaults, alt01GraceSeconds: 9 },
    );
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await count(subject)).toEqual({ preferences: 1, events: 1 });
    const current = await fixture.managementGet(
      subject.path,
      subject.auth.accessToken,
    );
    const value = current.body?.values as Record<string, number>;
    const newer = await save(subject, { ...value, alt02QueueSeconds: 75 }, 1);
    expect(newer.body?.revision).toBe(2);
    const conflicting = await save(
      subject,
      { ...value, alt02QueueSeconds: 90 },
      1,
    );
    expect(conflicting.status).toBe(409);
    expect(await count(subject)).toEqual({ preferences: 1, events: 2 });
  });

  it("rolls back the changed preference when the required tenant audit fails", async () => {
    const subject = await actor();
    await fixture.query(`CREATE FUNCTION issue414_fail_audit()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type='MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED' THEN
          RAISE EXCEPTION 'issue414 forced audit rollback';
        END IF;
        RETURN NEW;
      END;
      $$`);
    await fixture.query(`CREATE TRIGGER issue414_audit_failure
      BEFORE INSERT ON audit_events FOR EACH ROW
      EXECUTE FUNCTION issue414_fail_audit()`);
    const result = await save(subject, {
      ...defaults,
      alt06HandoffSeconds: 350,
    });
    expect(result.status).toBe(500);
    expect(await count(subject)).toEqual({ preferences: 0, events: 0 });
    await fixture.query("DROP TRIGGER issue414_audit_failure ON audit_events");
    const successful = await save(subject, {
      ...defaults,
      alt06HandoffSeconds: 350,
    });
    expect(successful.status).toBe(200);
    expect(await count(subject)).toEqual({ preferences: 1, events: 1 });
  });

  it("enforces SQL CHECK and same-tenant membership FK independently of Zod", async () => {
    const subject = await actor();
    const base = `INSERT INTO management_alert_timing_preferences
      (organization_id,user_id,alt01_grace_seconds)
      VALUES($1,$2,$3)`;
    await expect(
      fixture.query(base, [subject.organizationId, subject.user.id, 61]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      fixture.query(base, [subject.organizationId, randomUUID(), 1]),
    ).rejects.toMatchObject({ code: "23503" });
    const row = await fixture.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM management_alert_timing_preferences
       WHERE organization_id=$1`,
      [subject.organizationId],
    );
    expect(row.rows[0]?.n).toBe(0);
  });

  it("rejects inactive Location and denied Dashboard entitlement", async () => {
    const subject = await actor();
    await fixture.query(
      `UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE
       WHERE organization_id=$1`,
      [subject.organizationId],
    );
    expect(
      (await fixture.managementGet(subject.path, subject.auth.accessToken))
        .status,
    ).toBe(404);
    expect(
      (await save(subject, { ...defaults, alt01GraceSeconds: 30 })).status,
    ).toBe(404);
    await fixture.query(
      `UPDATE organization_subscriptions SET dashboard_access_enabled=TRUE
       WHERE organization_id=$1`,
      [subject.organizationId],
    );
    await fixture.query(
      `UPDATE locations SET status='INACTIVE', accepting_intake=FALSE WHERE id=$1`,
      [subject.locationId],
    );
    expect(
      (await fixture.managementGet(subject.path, subject.auth.accessToken))
        .status,
    ).toBe(404);
    expect(await count(subject)).toEqual({ preferences: 0, events: 0 });
  });
});
