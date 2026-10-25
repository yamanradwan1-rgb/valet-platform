import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { incidentResolutionFixture } from "./incident-resolution-test-fixture";

const { fixture, actor, seed, command } = incidentResolutionFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("#337 real HTTP and runtime PostgreSQL Incident resolution", () => {
  it.each(["OPEN", "INVESTIGATING"])(
    "resolves %s atomically, retains Critical/reporter/history and remains findable",
    async (status) => {
      const owner = await actor();
      const target = await seed(owner, status);
      const request = command(status);
      const send = () =>
        fixture.managementPost(
          `${target.base}/${target.incident}/resolve`,
          owner.auth.accessToken,
          request,
        );
      const response = await send();
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        incidentId: target.incident,
        status: "RESOLVED",
        severity: "CRITICAL",
        reporterDisplayName: "Synthetic Resolver",
        resolvedByDisplayName: "Synthetic Resolver",
        resolutionNotes: "Synthetic issue addressed",
        valetSessionId: target.session,
      });
      expect(response.body?.resolvedAt).toEqual(expect.any(String));
      expect((await send()).body).toEqual(response.body);
      const saved = await fixture.query<{ resolved_at: Date }>(
        `SELECT status::text,resolved_by_membership_id::text,reported_by_membership_id::text,
      resolution_notes,resolved_at FROM incidents WHERE id=$1`,
        [target.incident],
      );
      expect(saved.rows[0]).toMatchObject({
        status: "RESOLVED",
        resolved_by_membership_id: owner.member.membershipId,
        reported_by_membership_id: owner.member.membershipId,
        resolution_notes: "Synthetic issue addressed",
      });
      const audit = await fixture.query(
        `SELECT actor_membership_id::text,metadata_json,occurred_at FROM audit_events
      WHERE entity_id=$1 AND event_type='INCIDENT_RESOLVED'`,
        [target.incident],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        actor_membership_id: owner.member.membershipId,
        metadata_json: {
          incidentId: target.incident,
          fromStatus: status,
          toStatus: "RESOLVED",
        },
        occurred_at: saved.rows[0]?.resolved_at,
      });
      for (const filter of ["ALL", "RESOLVED", "ACTIVE"]) {
        const page = await fixture.managementGet(
          `${target.base}?filter=${filter}&limit=1`,
          owner.auth.accessToken,
        );
        expect(page.status).toBe(200);
        expect((page.body?.items as unknown[]).length).toBe(
          filter === "ACTIVE" ? 0 : 1,
        );
      }
      const defaultPage = await fixture.managementGet(
        target.base,
        owner.auth.accessToken,
      );
      expect(defaultPage.body?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ incidentId: target.incident }),
        ]),
      );
      expect(
        (
          await fixture.managementPost(
            `${target.base}/${target.incident}/resolve`,
            owner.auth.accessToken,
            command(),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.managementPost(
            `${target.base}/${target.incident}/resolve`,
            owner.auth.accessToken,
            { ...request, resolutionNotes: "Different note" },
          )
        ).body,
      ).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    },
    60_000,
  );

  it("serializes concurrent identical/conflicting resolutions and rejects stale/closed commands", async () => {
    const owner = await actor("LOCATION_MANAGER");
    const target = await seed(owner);
    const request = command();
    const send = (body = request) =>
      fixture.managementPost(
        `${target.base}/${target.incident}/resolve`,
        owner.auth.accessToken,
        body,
      );
    const identical = await Promise.all([send(), send()]);
    expect(identical.map((entry) => entry.status)).toEqual([201, 201]);
    expect(identical[0]?.body).toEqual(identical[1]?.body);
    const second = await seed(owner);
    const results = await Promise.all(
      [command(), command()].map((body) =>
        fixture.managementPost(
          `${target.base}/${second.incident}/resolve`,
          owner.auth.accessToken,
          body,
        ),
      ),
    );
    expect(results.map((entry) => entry.status).sort()).toEqual([201, 409]);
    for (const status of ["INVESTIGATING", "CLOSED"]) {
      const stale = await seed(owner, status);
      expect(
        (
          await fixture.managementPost(
            `${stale.base}/${stale.incident}/resolve`,
            owner.auth.accessToken,
            command(),
          )
        ).status,
      ).toBe(409);
    }
    const audits = await fixture.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events
      WHERE event_type='INCIDENT_RESOLVED' AND entity_id IN ($1,$2)`,
      [target.incident, second.incident],
    );
    expect(audits.rows[0]?.count).toBe(2);
    await fixture.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1`,
      [owner.member.membershipId],
    );
    expect((await send()).status).toBe(404);
  }, 60_000);

  it("denies foreign tenants, field roles, unassured Company Admin and client actor/time claims", async () => {
    const owner = await actor();
    const target = await seed(owner);
    for (const role of ["ORG_ADMIN", "VALET_EMPLOYEE", "VALET_SUPERVISOR"]) {
      const foreign = await actor(role);
      expect(
        (
          await fixture.managementPost(
            `${target.base}/${target.incident}/resolve`,
            foreign.auth.accessToken,
            command(),
          )
        ).status,
      ).toBe(404);
    }
    const unassured = await actor("ORG_ADMIN", false);
    const other = await seed(unassured);
    expect(
      (
        await fixture.managementPost(
          `${other.base}/${other.incident}/resolve`,
          unassured.auth.accessToken,
          command(),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fixture.managementPost(
          `${target.base}/${target.incident}/resolve`,
          owner.auth.accessToken,
          { ...command(), resolvedByMembershipId: owner.member.membershipId },
        )
      ).status,
    ).toBe(400);
    const saved = await fixture.query(
      `SELECT status::text,resolved_at FROM incidents WHERE id=$1`,
      [target.incident],
    );
    expect(saved.rows[0]).toEqual({ status: "OPEN", resolved_at: null });
  }, 60_000);
});
