import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManagementLocationService } from "../src/modules/management/management-location.service";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

const db = new PresenceServerTestContext("presence-strict-rollout");
let locations: ManagementLocationService;

beforeAll(async () => {
  await db.setup();
  locations = new ManagementLocationService(db.runtimePool);
}, 120_000);
afterAll(() => db.teardown(), 60_000);

function locationRequest() {
  return {
    operationId: randomUUID(),
    name: "Strict rollout setup",
    code: randomUUID(),
    addressText: "Synthetic",
    timezone: "Asia/Amman",
    currency: "JOD",
  };
}

describe("Issue #267 strict rollout management readiness", () => {
  it("persists REQUIRE and REQUIRE_OR_OVERRIDE through an exact Location override", async () => {
    const fixture = await db.createFixture();
    const manager = await db.manager(fixture, "LOCATION_MANAGER");
    await db.zone(fixture);
    let current = await db.management.location(manager.context, manager.target);
    const required = await db.management.changeLocation(
      manager.context,
      manager.target,
      {
        mutationId: randomUUID(),
        expectedRevision: current.overrides.revision,
        expectedCompanyRevision: current.company.revision,
        configurationFingerprint: current.readiness.configurationFingerprint,
        field: "shiftStartPresenceMode",
        value: "REQUIRE",
      },
    );
    expect(required).toMatchObject({
      effective: { startMode: "REQUIRE" },
      overrides: { startModeOverride: "REQUIRE", revision: 2 },
      readiness: {
        applicability: "STRICT",
        configurationUsable: true,
        strictActivationAllowed: true,
      },
    });
    current = required;
    const withOverride = await db.management.changeLocation(
      manager.context,
      manager.target,
      {
        mutationId: randomUUID(),
        expectedRevision: current.overrides.revision,
        expectedCompanyRevision: current.company.revision,
        configurationFingerprint: current.readiness.configurationFingerprint,
        field: "shiftStartPresenceMode",
        value: "REQUIRE_OR_OVERRIDE",
      },
    );
    expect(withOverride).toMatchObject({
      effective: { startMode: "REQUIRE_OR_OVERRIDE" },
      overrides: {
        startModeOverride: "REQUIRE_OR_OVERRIDE",
        revision: 3,
      },
    });
    expect(withOverride.readiness.blockers).not.toContain(
      "STRICT_ROLLOUT_CLOSED",
    );
  });

  it("clearing OFF into inherited strict is not-ready until a usable zone exists", async () => {
    const fixture = await db.createFixture();
    await db.policy(fixture, "REQUIRE", "OFF");
    const manager = await db.manager(fixture, "LOCATION_MANAGER");
    let current = await db.management.location(manager.context, manager.target);
    const explicitOff = await db.management.changeLocation(
      manager.context,
      manager.target,
      {
        mutationId: randomUUID(),
        expectedRevision: current.overrides.revision,
        expectedCompanyRevision: current.company.revision,
        configurationFingerprint: current.readiness.configurationFingerprint,
        field: "shiftStartPresenceMode",
        value: "OFF",
      },
    );
    const rejectedId = randomUUID();
    await expect(
      db.management.changeLocation(manager.context, manager.target, {
        mutationId: rejectedId,
        expectedRevision: explicitOff.overrides.revision,
        expectedCompanyRevision: explicitOff.company.revision,
        configurationFingerprint:
          explicitOff.readiness.configurationFingerprint,
        field: "shiftStartPresenceMode",
      }),
    ).rejects.toMatchObject({ code: "PRESENCE_NOT_READY" });
    current = await db.management.location(manager.context, manager.target);
    expect(current.overrides).toMatchObject({
      startModeOverride: "OFF",
      revision: 2,
    });
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM audit_events WHERE id=$1`,
          [rejectedId],
        )
      ).rows[0].count,
    ).toBe(0);

    await db.zone(fixture);
    current = await db.management.location(manager.context, manager.target);
    const cleared = await db.management.changeLocation(
      manager.context,
      manager.target,
      {
        mutationId: randomUUID(),
        expectedRevision: current.overrides.revision,
        expectedCompanyRevision: current.company.revision,
        configurationFingerprint: current.readiness.configurationFingerprint,
        field: "shiftStartPresenceMode",
      },
    );
    expect(cleared).toMatchObject({
      effective: { startMode: "REQUIRE" },
      overrides: { startModeOverride: null, revision: 3 },
      readiness: { configurationUsable: true, strictActivationAllowed: true },
    });
  });

  it("Company strict fanout succeeds only when every resulting strict Location is usable", async () => {
    const ready = await db.createFixture();
    const readyManager = await db.manager(ready);
    const secondReady = await locations.create(
      readyManager.context,
      ready.organizationId,
      locationRequest(),
    );
    await db.zone(ready);
    await db.zone({ ...ready, locationId: secondReady.locationId });
    const accepted = await db.management.setCompany(
      readyManager.context,
      readyManager.companyTarget,
      {
        mutationId: randomUUID(),
        expectedRevision: 1,
        field: "shiftStartPresenceMode",
        value: "REQUIRE",
      },
    );
    expect(accepted.policy).toMatchObject({
      startMode: "REQUIRE",
      revision: 2,
    });

    const blocked = await db.createFixture();
    const blockedManager = await db.manager(blocked);
    await locations.create(
      blockedManager.context,
      blocked.organizationId,
      locationRequest(),
    );
    await db.zone(blocked);
    const rejectedId = randomUUID();
    await expect(
      db.management.setCompany(
        blockedManager.context,
        blockedManager.companyTarget,
        {
          mutationId: rejectedId,
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "REQUIRE",
        },
      ),
    ).rejects.toMatchObject({ code: "PRESENCE_NOT_READY" });
    expect(
      (
        await db.management.company(
          blockedManager.context,
          blockedManager.companyTarget,
        )
      ).policy,
    ).toMatchObject({ startMode: "OFF", revision: 1 });
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM audit_events WHERE id=$1`,
          [rejectedId],
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it("blocks new Location creation beneath strict Company default", async () => {
    const fixture = await db.createFixture();
    await db.policy(fixture, "REQUIRE");
    const manager = await db.manager(fixture);
    await expect(
      locations.create(
        manager.context,
        fixture.organizationId,
        locationRequest(),
      ),
    ).rejects.toMatchObject({ code: "PRESENCE_NOT_READY" });
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM locations WHERE organization_id=$1`,
          [fixture.organizationId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it("keeps strict Location lifecycle readiness and activation fail-closed", async () => {
    const fixture = await db.createFixture({ locationStatus: "INACTIVE" });
    await db.policy(fixture, "REQUIRE");
    const manager = await db.manager(fixture);
    let lifecycle = await locations.read(
      manager.context,
      fixture.organizationId,
      fixture.locationId,
    );
    expect(lifecycle.readiness.readyForActivation).toBe(false);
    await expect(
      locations.activate(
        manager.context,
        fixture.organizationId,
        fixture.locationId,
        { expectedUpdatedAt: lifecycle.updatedAt },
      ),
    ).rejects.toMatchObject({ code: "PRESENCE_NOT_READY" });
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM audit_events
           WHERE location_id=$1 AND event_type='LOCATION_ACTIVATED'`,
          [fixture.locationId],
        )
      ).rows[0].count,
    ).toBe(0);

    await db.zone(fixture);
    lifecycle = await locations.read(
      manager.context,
      fixture.organizationId,
      fixture.locationId,
    );
    expect(lifecycle.readiness.readyForActivation).toBe(true);
    const activated = await locations.activate(
      manager.context,
      fixture.organizationId,
      fixture.locationId,
      { expectedUpdatedAt: lifecycle.updatedAt },
    );
    expect(activated).toMatchObject({
      status: "ACTIVE",
      acceptingIntake: true,
    });
  });
});
