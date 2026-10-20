import assert from "node:assert/strict";
import { firstPage, followPages } from "./issue300-w13-signed-http.mjs";

export function assertPrivateDenial(reply, status, code) {
  assert.equal(reply.status, status, "Unexpected authorization status");
  assert.equal(reply.cache, "no-store", "Denial must not be cached");
  assert.equal(reply.json?.code, code, "Denial lacks expected safe error code");
  assert.equal(
    typeof reply.json?.requestId,
    "string",
    "Denial must be a real managed API response, not a missing route",
  );
}

export function assertLateTaskAssociation(lane, oldTimeline, freshTimeline) {
  if (lane.kind !== "TASK_PARENT" || lane.outcome !== "commit") return;
  for (const auditId of lane.preexistingIndirectAuditIds) {
    const key = `AUDIT:${auditId}`;
    assert.equal(
      oldTimeline.ids.includes(key),
      false,
      "Old signed S0 admitted previously uncommitted Task relation",
    );
    const event = freshTimeline.all.find(
      (row) => row.key?.source === "AUDIT" && row.key?.eventId === auditId,
    );
    assert(
      event,
      "Fresh signed S1 has no exact independently certified Audit ID",
    );
    assert(
      event.references?.some(
        (reference) =>
          reference.kind === "SESSION" && reference.id === lane.session,
      ),
      "Late Task association lacks safe reference to certified Session",
    );
    assert.equal(
      event.quality,
      lane.expected.s1.qualityByKey[key],
      "Late Task parent altered historical confidence without oracle proof",
    );
  }
}

/** Independent source, pagination, and auth denial oracles. */
export function createW13Verifier({ plan, admin, client, ordinary, scopes }) {
  function assertLeaseLive() {
    assert(
      Date.now() < Date.parse(plan.proof.expiresAt),
      "Independent proof attestation expired before completion",
    );
  }

  function assertExpected(page, expected, kind) {
    assert.deepEqual(
      page.ids,
      expected[kind],
      `Actual signed ${kind} page union differs from independently signed oracle`,
    );
    assert.deepEqual(
      page.coverage,
      expected.coverage[kind],
      `Actual ${kind} source coverage differs from signed witness oracle`,
    );
    if (kind === "search") {
      for (const item of page.all) {
        assert(
          Object.hasOwn(expected.counts, item.sessionId),
          "Session absent from signed writer oracle",
        );
        assert.equal(
          item.matchingRecordCount,
          expected.counts[item.sessionId],
          "Source-qualified witness count mismatch",
        );
        const witnesses = expected.matchReasonsBySession?.[item.sessionId];
        assert(
          Array.isArray(witnesses),
          "Missing independent matching source-ID oracle",
        );
        const actual = item.matchReasons.map(
          (reason) => `${reason.source}:${reason.eventId}`,
        );
        assert.deepEqual(
          actual,
          witnesses,
          "Matching source witness identities differ from independent DB oracle",
        );
      }
    } else {
      const qualities = Object.fromEntries(
        page.all.map((item) => [
          `${item.key?.source}:${item.key?.eventId}`,
          item.quality,
        ]),
      );
      assert.deepEqual(
        qualities,
        expected.qualityByKey,
        "Every Timeline source quality must match signed independent oracle",
      );
    }
    for (const item of page.all) {
      const fields = JSON.stringify(item);
      assert(
        !/"(?:metadataJson|description|secret|customerAccessToken|photoUrl)"\s*:/i.test(
          fields,
        ),
        "Unsafe raw source field disclosed",
      );
    }
  }

  async function snapshot(path, token, kind, first) {
    const captured = first ?? (await firstPage(client, path, token));
    return followPages(client, path, token, captured, kind);
  }

  async function assertDefaultDisabled(lane, viewer) {
    for (const path of [lane.searchPath, lane.timelinePath]) {
      const denied = await ordinary(path, viewer.token);
      assertPrivateDenial(
        denied,
        503,
        path === lane.searchPath
          ? "AUDIT_INVESTIGATION_SNAPSHOT_UNAVAILABLE"
          : "AUDIT_INVESTIGATION_TIMELINE_UNAVAILABLE",
      );
    }
  }

  async function assertScope(lane, viewer, viewerRole, foreign, supervisor) {
    for (const path of [lane.searchPath, lane.timelinePath]) {
      const anonymous = await client(path, null);
      assertPrivateDenial(anonymous, 401, "STAFF_AUTHENTICATION_REQUIRED");
      for (const other of [foreign, supervisor]) {
        const denied = await client(path, other.token);
        assertPrivateDenial(denied, 404, "AUTHORIZATION_DENIED");
      }
    }
    for (const negative of lane.negativeScopes) {
      const rows = (
        await admin.query(
          `SELECT location.id::text AS id FROM public.locations AS location
         JOIN public.organizations AS organization ON organization.id=location.organization_id
         WHERE organization.id=$1::uuid AND location.id=$2::uuid
           AND organization.status='ACTIVE' AND location.status='ACTIVE'`,
          [negative.organizationId, negative.locationId],
        )
      ).rows;
      assert.equal(
        rows.length,
        1,
        "The rejected scope must be a real, independently verified Location",
      );
      if (negative.kind === "OTHER_LOCATION") {
        if (viewerRole === "CA") continue; // Company Admin has whole-Org access.
        const grant = (
          await admin.query(
            `SELECT 1 FROM membership_location_access AS access
           WHERE access.organization_id=$1::uuid AND access.location_id=$2::uuid
             AND access.membership_id=$3::uuid LIMIT 1`,
            [negative.organizationId, negative.locationId, viewer.membershipId],
          )
        ).rows;
        assert.equal(
          grant.length,
          0,
          "Other Location must have no current LM grant",
        );
      }
      assertPrivateDenial(
        await client(negative.path, viewer.token),
        404,
        "AUTHORIZATION_DENIED",
      );
    }
  }

  async function independentLateReadback(lane, expectedPresent) {
    const names = {
      AUDIT: "audit_events",
      KEY_CUSTODY: "key_custody_events",
      DISPATCH: "dispatch_events",
      INCIDENT: "incidents",
      TASK_PARENT: "tasks",
      INCIDENT_PARENT: "incidents",
    };
    const id =
      lane.kind === "TASK_PARENT"
        ? lane.task
        : lane.kind === "INCIDENT_PARENT"
          ? lane.incident
          : lane.id;
    const sql = `SELECT organization_id,location_id FROM public.${names[lane.kind]} WHERE id=$1`;
    const rows = (await admin.query(sql, [id])).rows;
    assert.equal(
      rows.length,
      expectedPresent ? 1 : 0,
      "Committed exact source/parent readback inconsistent",
    );
    if (expectedPresent) {
      assert.equal(rows[0].organization_id, lane.org);
      assert.equal(rows[0].location_id, lane.location);
    }
  }

  async function verifyOperationalBaseline() {
    const tables = {
      AUDIT: "audit_events",
      KEY_CUSTODY: "key_custody_events",
      DISPATCH: "dispatch_events",
      INCIDENT: "incidents",
    };
    const allTimeline = new Set(
      plan.fixture.lanes.flatMap((lane) => lane.expected.s0.timeline),
    );
    for (const receipt of plan.fixture.operationalWriterReceipts) {
      const table = tables[receipt.source];
      assert(table, "Unknown operational source receipt");
      assert(
        allTimeline.has(`${receipt.source}:${receipt.sourceId}`),
        "Actual domain write absent from independent signed Timeline S0 oracle",
      );
      const rows = (
        await admin.query(
          `SELECT organization_id,location_id FROM public.${table} WHERE id=$1`,
          [receipt.sourceId],
        )
      ).rows;
      assert.equal(
        rows.length,
        1,
        "Operational source missing from independently read database",
      );
      assert(
        scopes.some(
          (scope) =>
            scope.organizationId === rows[0].organization_id &&
            scope.locationId === rows[0].location_id,
        ),
        "Operational source outside exact Owner-attested tenant/Location",
      );
    }
  }

  async function verifyPreexistingIndirect(lane) {
    const expectedEntity =
      lane.kind === "TASK_PARENT"
        ? "Task"
        : lane.kind === "INCIDENT_PARENT"
          ? "Incident"
          : null;
    if (expectedEntity) {
      assert(
        (lane.preexistingIndirectAuditIds ?? []).length > 0,
        "Indirect lane needs approved pre-existing Audit anchors",
      );
    }
    for (const eventId of lane.preexistingIndirectAuditIds ?? []) {
      const rows = (
        await admin.query(
          `SELECT organization_id,location_id,entity_type,entity_id,
         valet_session_id FROM public.audit_events WHERE id=$1`,
          [eventId],
        )
      ).rows;
      assert.equal(rows.length, 1, "Missing independent pre-S0 Audit anchor");
      assert.equal(rows[0].organization_id, lane.org);
      assert.equal(rows[0].location_id, lane.location);
      assert.equal(rows[0].entity_type, expectedEntity);
      assert.equal(
        rows[0].entity_id,
        lane.kind === "TASK_PARENT" ? lane.task : lane.incident,
      );
    }
  }
  return {
    assertLeaseLive,
    assertExpected,
    snapshot,
    assertDefaultDisabled,
    assertScope,
    independentLateReadback,
    verifyOperationalBaseline,
    verifyPreexistingIndirect,
  };
}
