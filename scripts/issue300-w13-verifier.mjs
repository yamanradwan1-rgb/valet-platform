import assert from "node:assert/strict";
import { firstPage, followPages } from "./issue300-w13-signed-http.mjs";

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
      for (const item of page.all) {
        const key = `${item.key?.source}:${item.key?.eventId}`;
        if (Object.hasOwn(expected.qualityByKey ?? {}, key))
          assert.equal(
            item.quality,
            expected.qualityByKey[key],
            "Indirect association confidence differs from signed independent oracle",
          );
      }
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
      assert.equal(
        denied.status,
        503,
        "Ordinary unproven cohort must be HTTP 503 with valid MFA",
      );
      assert.equal(denied.cache, "no-store");
    }
  }

  async function assertScope(lane, viewer, foreign, supervisor) {
    for (const path of [lane.searchPath, lane.timelinePath]) {
      const anonymous = await client(path, null);
      assert.equal(anonymous.status, 401);
      assert.equal(anonymous.cache, "no-store");
      for (const other of [foreign, supervisor]) {
        const denied = await client(path, other.token);
        assert.notEqual(
          denied.status,
          200,
          "Wrong tenant/role read Investigation",
        );
        assert.equal(denied.cache, "no-store");
      }
    }
    for (const path of lane.negativeScopePaths ?? []) {
      assert(path.startsWith("/v1/staff/management/"));
      const denied = await client(path, viewer.token);
      assert.notEqual(
        denied.status,
        200,
        "Unexpected authorization outside attested Location/tenant",
      );
      assert.equal(denied.cache, "no-store");
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
