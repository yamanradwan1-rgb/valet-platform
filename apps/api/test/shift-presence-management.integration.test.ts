import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

const db = new PresenceServerTestContext("presence-management");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 60_000);

describe("current CA and exact LM presence management", () => {
  it("publishes inheritance, one-field Company CAS and no-op without a revision or audit", async () => {
    const f = await db.createFixture();
    const manager = await db.manager(f);
    const initial = await db.management.company(
      manager.context,
      manager.companyTarget,
    );
    expect(initial.policy).toMatchObject({
      startMode: "OFF",
      endMode: "OFF",
      maxAccuracyMeters: 50,
      maxFixAgeSeconds: 30,
      revision: 1,
    });
    const mutationId = randomUUID();
    const changed = await db.management.setCompany(
      manager.context,
      manager.companyTarget,
      {
        mutationId,
        expectedRevision: 1,
        field: "shiftStartPresenceMode",
        value: "WARN_ONLY",
      },
    );
    expect(changed.policy).toMatchObject({
      startMode: "WARN_ONLY",
      revision: 2,
    });
    expect(
      await db.management.result(
        manager.context,
        manager.companyTarget,
        mutationId,
      ),
    ).toMatchObject({
      attribution: "COMMITTED",
      entityId: f.organizationId,
      revision: 2,
      canonical: { kind: "POLICY", value: changed },
    });
    const unknown = randomUUID();
    await db.management.setCompany(manager.context, manager.companyTarget, {
      mutationId: unknown,
      expectedRevision: 2,
      field: "shiftStartPresenceMode",
      value: "WARN_ONLY",
    });
    expect(
      await db.management.result(
        manager.context,
        manager.companyTarget,
        unknown,
      ),
    ).toMatchObject({
      attribution: "COMMITTED",
      effect: "NO_CHANGE",
      entityId: f.organizationId,
      revision: 2,
      canonical: { value: changed },
    });
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM audit_events WHERE event_type='SHIFT_PRESENCE_COMPANY_POLICY_CHANGED' AND organization_id=$1`,
          [f.organizationId],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it("Location explicit OFF is a real override and CLEAR rechecks paired context", async () => {
    const f = await db.createFixture();
    const m = await db.manager(f, "LOCATION_MANAGER");
    let current = await db.management.location(m.context, m.target);
    const first = await db.management.changeLocation(m.context, m.target, {
      mutationId: randomUUID(),
      expectedRevision: 1,
      expectedCompanyRevision: 1,
      configurationFingerprint: current.readiness.configurationFingerprint,
      field: "shiftStartPresenceMode",
      value: "OFF",
    });
    expect(first.overrides).toMatchObject({
      startModeOverride: "OFF",
      revision: 2,
    });
    await db.policy(f, "WARN_ONLY");
    await expect(
      db.management.changeLocation(m.context, m.target, {
        mutationId: randomUUID(),
        expectedRevision: 2,
        expectedCompanyRevision: 1,
        configurationFingerprint: first.readiness.configurationFingerprint,
        field: "shiftStartPresenceMode",
      }),
    ).rejects.toMatchObject({ code: "PRESENCE_INHERITED_CONTEXT_CONFLICT" });
    current = await db.management.location(m.context, m.target);
    const cleared = await db.management.changeLocation(m.context, m.target, {
      mutationId: randomUUID(),
      expectedRevision: 2,
      expectedCompanyRevision: current.company.revision,
      configurationFingerprint: current.readiness.configurationFingerprint,
      field: "shiftStartPresenceMode",
    });
    expect(cleared.overrides).toMatchObject({
      startModeOverride: null,
      revision: 3,
    });
    expect(cleared.effective.startMode).toBe("WARN_ONLY");
  });
  it("zone mutation has its own revision and exact reconciliation, stale writer cannot overwrite", async () => {
    const f = await db.createFixture();
    const m = await db.manager(f);
    const mutationId = randomUUID();
    const zoneId = randomUUID();
    const draft = {
      mutationId,
      zoneId,
      code: "ARRIVAL",
      label: "Synthetic",
      latitude: 31.95,
      longitude: 35.91,
      radiusMeters: 100,
      state: "ACTIVE" as const,
    };
    const created = await db.management.saveZone(m.context, m.target, draft);
    expect(created.zone.revision).toBe(1);
    expect(created.readiness.configurationUsable).toBe(true);
    expect(
      (await db.management.location(m.context, m.target)).overrides.revision,
    ).toBe(1);
    const result = await db.management.result(m.context, m.target, mutationId, {
      kind: "ZONE",
      entityId: zoneId,
    });
    expect(result).toMatchObject({
      attribution: "COMMITTED",
      entityId: zoneId,
      revision: 1,
      canonical: { kind: "ZONE", value: { zone: created.zone } },
    });
    if (!("readiness" in result.canonical.value))
      throw new Error("Expected current zone readiness");
    expect(
      Date.parse(result.canonical.value.readiness.observedAt),
    ).toBeGreaterThanOrEqual(Date.parse(created.readiness.observedAt));
    const update = {
      mutationId,
      code: draft.code,
      label: draft.label,
      latitude: draft.latitude,
      longitude: draft.longitude,
      radiusMeters: draft.radiusMeters,
      state: draft.state,
    };
    await db.management.saveZone(
      m.context,
      m.target,
      {
        ...update,
        mutationId: randomUUID(),
        expectedRevision: 1,
        state: "DISABLED",
      },
      zoneId,
    );
    await expect(
      db.management.saveZone(
        m.context,
        m.target,
        { ...update, mutationId: randomUUID(), expectedRevision: 1 },
        zoneId,
      ),
    ).rejects.toMatchObject({ code: "PRESENCE_CONFIGURATION_CONFLICT" });
    expect(
      (await db.management.zone(m.context, m.target, zoneId)).zone,
    ).toMatchObject({ revision: 2, state: "DISABLED" });
  });
  it("strict policy remains SQL and public release gated, and failure changes no revision/audit", async () => {
    const f = await db.createFixture();
    const m = await db.manager(f);
    await expect(
      db.management.setCompany(m.context, m.companyTarget, {
        mutationId: randomUUID(),
        expectedRevision: 1,
        field: "shiftStartPresenceMode",
        value: "REQUIRE",
      }),
    ).rejects.toMatchObject({ code: "PRESENCE_NOT_READY" });
    await db.zone(f);
    await expect(
      db.management.setCompany(m.context, m.companyTarget, {
        mutationId: randomUUID(),
        expectedRevision: 1,
        field: "shiftStartPresenceMode",
        value: "REQUIRE",
      }),
    ).rejects.toMatchObject({ code: "PRESENCE_STRICT_ROLLOUT_CLOSED" });
    await expect(db.policy(f, "REQUIRE")).rejects.toMatchObject({
      code: "23514",
      constraint: "organizations_presence_strict_release_closed",
    });
    expect(
      (await db.management.company(m.context, m.companyTarget)).policy.revision,
    ).toBe(1);
    expect(
      (
        await db.adminPool.query(
          `SELECT count(*)::int AS count FROM audit_events WHERE organization_id=$1`,
          [f.organizationId],
        )
      ).rows[0].count,
    ).toBe(0);
  });
});
