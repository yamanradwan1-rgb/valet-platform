import { presenceZoneDraft } from "./shift-presence-zone-test-helper";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import {
  presenceCommitBarrier,
  observePresenceCommandWait,
  mutationAuditCount,
  abortPresenceCommitBarriers,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-zone-evaluation-races");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
}, 120_000);
afterAll(() => db.teardown(), 60_000);
afterEach(() => abortPresenceCommitBarriers());

describe("R12 zone replacement remains coherent with strict evaluation", () => {
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "last two usable zones cannot both be disabled, first %s",
    async (outcome) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      const firstId = await db.zone(f);
      const secondId = await db.zone(f);
      await db.policy(f, "REQUIRE");
      const editableZone = (
        await db.management.zone(m.context, m.target, firstId)
      ).zone;
      const revision = editableZone.revision;
      const draft = presenceZoneDraft(editableZone);
      const secondZone = (
        await db.management.zone(m.context, m.target, secondId)
      ).zone;
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new PresenceManagementService(gate.pool)
        .saveZone(
          m.context,
          m.target,
          {
            ...draft,
            state: "DISABLED",
            mutationId: randomUUID(),
            expectedRevision: revision,
          },
          firstId,
        )
        .catch((error) => error);
      await gate.atCommit;
      const second = db.management
        .saveZone(
          m.context,
          m.target,
          {
            ...draft,
            code: secondZone.code,
            state: "DISABLED",
            mutationId: randomUUID(),
            expectedRevision: 1,
          },
          secondId,
        )
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      const result = await second;
      if (outcome === "ROLLBACK") expect(result.zone.state).toBe("DISABLED");
      else expect(result).toMatchObject({ code: "PRESENCE_NOT_READY" });
      const readiness = (await db.management.location(m.context, m.target))
        .readiness;
      expect(readiness).toMatchObject({
        activeZoneCount: 1,
        configurationUsable: true,
        strictActivationAllowed: false,
      });
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_ZONE_UPDATED",
        ),
      ).toBe(1);
    },
  );
  it.each([
    ["MOVE", "COMMIT"],
    ["MOVE", "ROLLBACK"],
    ["MOVE", "UNKNOWN"],
    ["SHRINK", "COMMIT"],
    ["SHRINK", "ROLLBACK"],
    ["SHRINK", "UNKNOWN"],
  ] as const)(
    "%s the last zone vs issued strict START, editor %s",
    async (edit, outcome) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      const id = await db.zone(f);
      await db.policy(f, "REQUIRE");
      const session = await db.session(f.userId);
      const challenge = await db.challenge(f, session.context);
      const evidence = db.measured(
        challenge,
        edit === "SHRINK" ? 31.9501 : 31.95,
      );
      const editableZone = (await db.management.zone(m.context, m.target, id))
        .zone;
      const revision = editableZone.revision;
      const draft = presenceZoneDraft(editableZone);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new PresenceManagementService(gate.pool)
        .saveZone(
          m.context,
          m.target,
          {
            ...draft,
            ...(edit === "MOVE" ? { latitude: 32.1 } : { radiusMeters: 5 }),
            mutationId: randomUUID(),
            expectedRevision: revision,
          },
          id,
        )
        .catch((error) => error);
      await gate.atCommit;
      const start = db
        .start(f, session.context, evidence)
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      const result = await start;
      if (outcome === "ROLLBACK") expect(result.status).toBe("ACTIVE");
      else expect(result).toMatchObject({ code: "PRESENCE_REJECTED" });
      expect(await db.facts(f)).toEqual({
        shifts: outcome === "ROLLBACK" ? 1 : 0,
        decisions: outcome === "ROLLBACK" ? 1 : 0,
        starts: outcome === "ROLLBACK" ? 1 : 0,
        ends: 0,
      });
      expect(
        (await db.management.zone(m.context, m.target, id)).zone.revision,
      ).toBe(outcome === "ROLLBACK" ? 1 : 2);
      expect(
        await mutationAuditCount(
          db,
          f.organizationId,
          "SHIFT_PRESENCE_ZONE_UPDATED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 0 : 1);
    },
  );
  it("shrinking a valid last zone changes its geometry, while disabling it cannot strand strict policy", async () => {
    const f = await db.createFixture();
    const m = await db.manager(f);
    const id = await db.zone(f);
    await db.policy(f, "REQUIRE");
    const session = await db.session(f.userId);
    const challenge = await db.challenge(f, session.context);
    const evidence = db.measured(challenge, 31.9501);
    const editableZone = (await db.management.zone(m.context, m.target, id))
      .zone;
    const revision = editableZone.revision;
    const draft = presenceZoneDraft(editableZone);
    const shrunk = await db.management.saveZone(
      m.context,
      m.target,
      {
        ...draft,
        radiusMeters: 5,
        mutationId: randomUUID(),
        expectedRevision: revision,
      },
      id,
    );
    expect(shrunk.readiness.configurationUsable).toBe(true);
    await expect(db.start(f, session.context, evidence)).rejects.toMatchObject({
      code: "PRESENCE_REJECTED",
    });
    await expect(
      db.management.saveZone(
        m.context,
        m.target,
        {
          ...draft,
          state: "DISABLED",
          mutationId: randomUUID(),
          expectedRevision: 2,
        },
        id,
      ),
    ).rejects.toMatchObject({ code: "PRESENCE_NOT_READY" });
    expect(
      (await db.management.zone(m.context, m.target, id)).zone,
    ).toMatchObject({ revision: 2, state: "ACTIVE", radiusMeters: 5 });
    expect(
      await mutationAuditCount(
        db,
        f.organizationId,
        "SHIFT_PRESENCE_ZONE_UPDATED",
      ),
    ).toBe(1);
  });
});
