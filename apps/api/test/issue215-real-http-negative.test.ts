import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  openIssue215HttpFixture,
  syntheticJpeg,
  type Issue215HttpFixture,
} from "./issue215-http-fixture";

describe("#284 actual Nest HTTP rejection, tenant authority and custody isolation", () => {
  let h: Issue215HttpFixture;
  beforeAll(async () => { h = await openIssue215HttpFixture(); }, 240_000);
  afterAll(async () => { await h?.close(); }, 90_000);

  async function evidenceCount(sessionId: string) {
    const result = await h.db.admin.query<{
      operations: number; verifications: number; audits: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM condition_photo_upload_operations
         WHERE valet_session_id=$1) AS operations,
        (SELECT count(*)::int FROM vehicle_photo_verifications
         WHERE valet_session_id=$1) AS verifications,
        (SELECT count(*)::int FROM audit_events
         WHERE valet_session_id=$1 AND event_type IN
           ('CHECK_IN_CONDITION_PHOTO_VERIFIED',
            'VALET_SESSION_CHECK_IN_CONDITION_COMPLETED',
            'VALET_SESSION_CHECK_IN_COMPLETED')) AS audits`,
      [sessionId],
    );
    return result.rows[0];
  }

  it("rejects absent and malformed credentials before JPEG upload/admission", async () => {
    const { scope } = await h.seed(true);
    for (const authorization of ["", "Bearer invalid", "Basic invalid"]) {
      const read = await h.request(
        "GET", scope.sessionId, authorization, "condition-photo-state",
      );
      const upload = await h.upload(
        scope.sessionId, authorization, randomUUID(), await syntheticJpeg(),
      );
      expect(read.status).toBe(401);
      expect(upload.status).toBe(401);
      expect(JSON.stringify(upload.body)).not.toMatch(/bucket|object.key|secret/i);
    }
    expect(await evidenceCount(scope.sessionId)).toEqual({
      operations: 0, verifications: 0, audits: 0,
    });
  }, 60_000);

  it("blocks foreign-tenant photo discovery and upload before durable T1", async () => {
    const foreign = await h.seed(true);
    const other = await h.seed(true);
    const discovery = await h.request(
      "GET", foreign.scope.sessionId, other.authorization,
      "condition-photo-state",
    );
    const upload = await h.upload(
      foreign.scope.sessionId, other.authorization, randomUUID(),
      await syntheticJpeg(),
    );
    expect(discovery.status).toBe(404);
    expect(upload.status).toBe(404);
    expect(await evidenceCount(foreign.scope.sessionId)).toEqual({
      operations: 0, verifications: 0, audits: 0,
    });
  }, 60_000);

  it("rejects a revoked exact bearer for subsequent GET and upload", async () => {
    const { scope, authorization } = await h.seed(true);
    await h.db.admin.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1",
      [scope.userId],
    );
    expect((await h.request(
      "GET", scope.sessionId, authorization, "condition-photo-state",
    )).status).toBe(401);
    expect((await h.upload(
      scope.sessionId, authorization, randomUUID(), await syntheticJpeg(),
    )).status).toBe(401);
    expect(await evidenceCount(scope.sessionId)).toEqual({
      operations: 0, verifications: 0, audits: 0,
    });
  }, 60_000);

  it("fences a newly REQUIRED policy after optional marker replay", async () => {
    const { scope, authorization } = await h.seed(false);
    const marker = await h.request(
      "POST", scope.sessionId, authorization, "condition-completion", {},
    );
    expect(marker.status).toBe(200);
    await h.db.admin.query(
      "UPDATE locations SET check_in_photos_required_override=TRUE WHERE id=$1",
      [scope.locationId],
    );
    const result = await h.request(
      "POST", scope.sessionId, authorization, "complete",
      { expectedVersion: 1 },
    );
    expect(result.status).toBe(422);
    expect(result.body.code).toBe("PHOTO_REQUIREMENT_NOT_SATISFIED");
    expect(await evidenceCount(scope.sessionId)).toEqual({
      operations: 0, verifications: 0, audits: 1,
    });
  });

  it("rejects new upload after final custody transition without a new T1", async () => {
    const { scope, authorization } = await h.seed(false);
    expect((await h.request(
      "POST", scope.sessionId, authorization, "condition-completion", {},
    )).status).toBe(200);
    expect((await h.request(
      "POST", scope.sessionId, authorization, "complete",
      { expectedVersion: 1 },
    )).status).toBe(200);
    const result = await h.upload(
      scope.sessionId, authorization, randomUUID(), await syntheticJpeg(),
    );
    // The completed session is deliberately hidden by current-scope authorization.
    expect(result.status).toBe(404);
    expect(await evidenceCount(scope.sessionId)).toEqual({
      operations: 0, verifications: 0, audits: 2,
    });
  }, 60_000);
});
