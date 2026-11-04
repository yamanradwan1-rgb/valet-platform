import { managementAlertTimingPreferenceDefaults as defaults } from "@valet/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function orgAuditPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/audit-events`;
}

describe("Issue #414 Audit Explorer CA known event, real PG17, MFA bypass OFF", () => {
  it("shows canonical safe own-User change to CA only; keeps LM/Supervisor scope unchanged", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id);
    const location = await fixture.addLocation(membership.organizationId);
    const caAuth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(caAuth);
    const preferencePath = `/v1/staff/management/organizations/${membership.organizationId}/locations/${location.locationId}/alert-timing-preferences`;
    const saved = await fixture.managementPut(
      preferencePath,
      caAuth.accessToken,
      {
        expectedRevision: 0,
        values: {
          ...defaults,
          alt02QueueSeconds: 90,
          alt06HandoffSeconds: 360,
        },
      },
    );
    expect(saved.status).toBe(200);

    const orgPath = orgAuditPath(membership.organizationId);
    const knownType = "MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED";
    const ca = await fixture.managementGet(
      `${orgPath}?eventType=${knownType}`,
      caAuth.accessToken,
    );
    expect(ca.status).toBe(200);
    const events = ca.body?.items as readonly Record<string, unknown>[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: { type: "MEMBERSHIP", membershipId: membership.membershipId },
      entity: null,
      eventType: knownType,
      scope: { kind: "ORGANIZATION" },
      details: {
        kind: "MANAGEMENT",
        changedKeys: ["alt02QueueSeconds", "alt06HandoffSeconds"],
        beforeRevision: 0,
        afterRevision: 1,
      },
    });
    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain('"alt02QueueSeconds":90');
    expect(serialized).not.toContain('"alt06HandoffSeconds":360');
    for (const forbidden of [
      "alt02_queue_seconds",
      "alt06_handoff_seconds",
      "metadata_json",
      "paymentProvider",
      "accessToken",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    const lm = await fixture.createUser();
    const lmMember = await fixture.addMembership(
      membership.organizationId,
      lm.id,
      "LOCATION_MANAGER",
    );
    await fixture.grantLocationAccess(
      membership.organizationId,
      lmMember,
      location.locationId,
    );
    const lmAuth = await fixture.nativeLogin(lm);
    expect(
      (await fixture.managementGet(orgPath, lmAuth.accessToken)).status,
    ).toBe(404);
    const locationAuditPath = `/v1/staff/management/organizations/${membership.organizationId}/locations/${location.locationId}/audit-events`;
    const lmLocation = await fixture.managementGet(
      locationAuditPath,
      lmAuth.accessToken,
    );
    expect(lmLocation.status).toBe(200);
    expect(lmLocation.body?.items).toEqual([]);

    const supervisor = await fixture.createUser();
    const supervisorMember = await fixture.addMembership(
      membership.organizationId,
      supervisor.id,
      "VALET_SUPERVISOR",
    );
    await fixture.grantLocationAccess(
      membership.organizationId,
      supervisorMember,
      location.locationId,
    );
    await fixture.startActiveShift(
      membership.organizationId,
      location.locationId,
      supervisorMember,
    );
    const supervisorAuth = await fixture.nativeLogin(supervisor);
    expect(
      (await fixture.managementGet(orgPath, supervisorAuth.accessToken)).status,
    ).toBe(404);
    const supervisorLocation = await fixture.managementGet(
      locationAuditPath,
      supervisorAuth.accessToken,
    );
    expect(supervisorLocation.status).toBe(200);
    expect(supervisorLocation.body?.items).toEqual([]);
  });

  it("drops malformed key names and raw private metadata in the CA event projection", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id);
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);
    const eventId = await fixture.insertAuditEvent({
      actorMembershipId: membership.membershipId,
      entityId: user.id,
      entityType: "User",
      eventType: "MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED",
      locationId: null,
      metadata: {
        changedKeys: "alt01GraceSeconds,accessToken",
        beforeRevision: 1,
        afterRevision: 2,
        accessToken: "PRIVATE-SECRET",
        alt01GraceSeconds: 60,
      },
      organizationId: membership.organizationId,
    });
    const response = await fixture.managementGet(
      orgAuditPath(membership.organizationId),
      auth.accessToken,
    );
    expect(response.status).toBe(200);
    const events = response.body?.items as Array<Record<string, unknown>>;
    const item = events.find((candidate) => candidate.eventId === eventId);
    expect(item?.details).toEqual({ kind: "MANAGEMENT" });
    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain("PRIVATE-SECRET");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain('"alt01GraceSeconds":60');
  });
});
