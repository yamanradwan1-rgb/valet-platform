import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shiftPresenceManagementResultSchema } from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { presenceHttp } from "./shift-presence-http-test-helper";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import {
  abortPresenceCommitBarriers,
  observePresenceCommandWait,
  presenceCommitBarrier,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-policy-noop-recovery");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterAll(async () => {
  abortPresenceCommitBarriers();
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe("successful no-op correlation without fictitious change audits or unsafe identity reuse", () => {
  it.each(["COMPANY", "LOCATION_SET", "LOCATION_CLEAR"] as const)(
    "%s survives lost response with unchanged revision and exact NO_CHANGE receipt",
    async (kind) => {
      const f = await db.createFixture();
      const m = await db.manager(f);
      const company = `/v1/staff/management/organizations/${f.organizationId}/shift-presence`;
      const location = `${company}/locations/${f.locationId}`;
      let projection = await db.management.location(m.context, m.target);
      if (kind === "LOCATION_SET") {
        projection = await db.management.changeLocation(m.context, m.target, {
          mutationId: randomUUID(),
          field: "shiftStartPresenceMode",
          value: "OFF",
          expectedRevision: 1,
          expectedCompanyRevision: 1,
          configurationFingerprint:
            projection.readiness.configurationFingerprint,
        });
      }
      const mutationId = randomUUID();
      const isCompany = kind === "COMPANY";
      const command = isCompany
        ? {
            mutationId,
            field: "shiftStartPresenceMode",
            value: "OFF",
            expectedRevision: 1,
          }
        : {
            mutationId,
            field: "shiftStartPresenceMode",
            ...(kind === "LOCATION_SET" ? { value: "OFF" } : {}),
            expectedRevision: projection.overrides.revision,
            expectedCompanyRevision: 1,
            configurationFingerprint:
              projection.readiness.configurationFingerprint,
          };
      const path = isCompany
        ? `${company}/policy/default`
        : `${location}/policy/override${kind === "LOCATION_CLEAR" ? "/clear" : ""}`;
      const method = kind === "LOCATION_CLEAR" ? "POST" : "PUT";
      await expect(
        http.request(method, path, m.token, command, "DISCONNECT"),
      ).rejects.toThrow();
      await http.app.close();
      http = await presenceHttp(db);
      const read = await http.request(
        "GET",
        `${isCompany ? company : location}/results/${mutationId}`,
        m.token,
      );
      expect(read.status).toBe(200);
      expect(
        shiftPresenceManagementResultSchema.parse(read.body),
      ).toMatchObject({
        attribution: "COMMITTED",
        effect: "NO_CHANGE",
        entityId: isCompany ? f.organizationId : f.locationId,
        revision: command.expectedRevision,
      });
      const facts = (
        await db.adminPool.query(
          `SELECT
      (SELECT count(*)::integer FROM audit_events WHERE id=$1) AS audits,
      (SELECT count(*)::integer FROM shift_presence_management_results WHERE mutation_id=$1 AND effect='NO_CHANGE') AS receipts`,
          [mutationId],
        )
      ).rows[0];
      expect(facts).toEqual({ audits: 0, receipts: 1 });
      expect(
        (await http.request(method, path, m.token, command)).body.code,
      ).toBe("PRESENCE_MUTATION_CONFLICT");
      // A changed command cannot silently take over the no-op's identity.
      expect(
        (
          await http.request(
            "PUT",
            isCompany
              ? `${company}/policy/default`
              : `${location}/policy/override`,
            m.token,
            { ...command, value: "WARN_ONLY" },
          )
        ).body.code,
      ).toBe("PRESENCE_MUTATION_CONFLICT");
      expect(
        (await db.management.location(m.context, m.target)).effective.startMode,
      ).toBe("OFF");
    },
  );
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "cross-Organization identity collision %s has one truthful terminal winner and no ghost audit",
    async (outcome) => {
      const f1 = await db.createFixture();
      const m1 = await db.manager(f1);
      const f2 = await db.createFixture();
      const m2 = await db.manager(f2);
      const mutationId = randomUUID();
      const barrier = presenceCommitBarrier(db.runtimePool);
      const first = new PresenceManagementService(barrier.pool)
        .setCompany(m1.context, m1.companyTarget, {
          mutationId,
          expectedRevision: 1,
          field: "shiftStartPresenceMode",
          value: "OFF",
        })
        .catch((e) => e);
      try {
        await barrier.atCommit;
        const second = db.management
          .setCompany(m2.context, m2.companyTarget, {
            mutationId,
            expectedRevision: 1,
            field: "shiftStartPresenceMode",
            value: "WARN_ONLY",
          })
          .catch((e) => e);
        await observePresenceCommandWait(db);
        barrier.finish(outcome);
        const [a, b] = await Promise.all([first, second]);
        if (outcome === "ROLLBACK") {
          expect(a).toBeInstanceOf(Error);
          expect(b.policy.startMode).toBe("WARN_ONLY");
        } else {
          expect(b).toMatchObject({ code: "PRESENCE_MUTATION_CONFLICT" });
          if (outcome === "UNKNOWN")
            expect(a).toMatchObject({ message: "TEST_COMMIT_OUTCOME_UNKNOWN" });
        }
        const r1 = await db.management.result(
          m1.context,
          m1.companyTarget,
          mutationId,
        );
        const r2 = await db.management.result(
          m2.context,
          m2.companyTarget,
          mutationId,
        );
        expect(r1).toMatchObject({
          attribution: outcome === "ROLLBACK" ? "UNKNOWN" : "COMMITTED",
          effect: outcome === "ROLLBACK" ? null : "NO_CHANGE",
        });
        expect(r2).toMatchObject({
          attribution: outcome === "ROLLBACK" ? "COMMITTED" : "UNKNOWN",
          effect: outcome === "ROLLBACK" ? "CHANGED" : null,
        });
        expect(
          (await db.management.company(m2.context, m2.companyTarget)).policy,
        ).toMatchObject({
          startMode: outcome === "ROLLBACK" ? "WARN_ONLY" : "OFF",
          revision: outcome === "ROLLBACK" ? 2 : 1,
        });
        const facts = (
          await db.adminPool.query(
            `SELECT
        (SELECT count(*)::integer FROM audit_events WHERE id=$1) AS audits,
        (SELECT count(*)::integer FROM shift_presence_management_results WHERE mutation_id=$1) AS receipts`,
            [mutationId],
          )
        ).rows[0];
        expect(facts).toEqual({
          audits: outcome === "ROLLBACK" ? 1 : 0,
          receipts: 1,
        });
      } finally {
        barrier.finish("ROLLBACK");
      }
    },
  );
  it("pre-correction exact audits remain recoverable and reserve their mutation identity", async () => {
    const f = await db.createFixture();
    const m = await db.manager(f);
    const mutationId = randomUUID();
    await db.adminPool.query(
      `INSERT INTO audit_events(id,organization_id,actor_membership_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
      VALUES($1,$2,$3,'MEMBERSHIP','SHIFT_PRESENCE_COMPANY_POLICY_CHANGED','Organization',$2,'{"revision":1,"field":"shiftStartPresenceMode","operation":"SET"}',clock_timestamp())`,
      [mutationId, f.organizationId, m.membershipId],
    );
    expect(
      await db.management.result(m.context, m.companyTarget, mutationId),
    ).toMatchObject({
      attribution: "COMMITTED",
      effect: "CHANGED",
      revision: 1,
    });
    await expect(
      db.management.setCompany(m.context, m.companyTarget, {
        mutationId,
        expectedRevision: 1,
        field: "shiftStartPresenceMode",
        value: "WARN_ONLY",
      }),
    ).rejects.toMatchObject({ code: "PRESENCE_MUTATION_CONFLICT" });
    expect(
      (await db.management.company(m.context, m.companyTarget)).policy
        .startMode,
    ).toBe("OFF");
  });
});
