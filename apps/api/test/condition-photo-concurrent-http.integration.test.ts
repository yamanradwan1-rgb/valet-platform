import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  openIssue215HttpFixture,
  type Issue215HttpFixture,
} from "./issue215-http-fixture";
import { syntheticSizedJpeg } from "./condition-photo-jpeg-fixture";

/** Explicit protected PG/MinIO qualification lane; no mocks or silent skips. */
describe("concurrent HTTP photos bind independent authorized scopes", () => {
  let h: Issue215HttpFixture;
  beforeAll(async () => {
    h = await openIssue215HttpFixture();
  }, 240_000);
  afterAll(async () => {
    await h?.close();
  }, 90_000);

  it("verifies three real JPEGs and completes three Check-Ins with one audit each", async () => {
    const dimensions = [
      [720, 540],
      [1280, 960],
      [2048, 1536],
    ] as const;
    const inputs = [];
    for (const [width, height] of dimensions) {
      const actor = await h.seed(true);
      inputs.push({
        ...actor,
        operationId: randomUUID(),
        bytes: await syntheticSizedJpeg(width, height),
      });
    }
    const uploads = await Promise.all(
      inputs.map((input) =>
        h.upload(
          input.scope.sessionId,
          input.authorization,
          input.operationId,
          input.bytes,
        ),
      ),
    );
    for (const [index, input] of inputs.entries()) {
      expect(uploads[index]!.status).toBe(201);
      expect(uploads[index]!.body).toMatchObject({
        status: "VERIFIED",
        operationId: input.operationId,
        valetSessionId: input.scope.sessionId,
      });
      const records = await h.db.admin.query(
        `SELECT o.source_sha256, o.actor_membership_id, o.location_id, o.organization_id,
                a.object_key, a.object_version, a.status::text AS attempt_status,
                v.content_sha256, v.byte_size
         FROM condition_photo_upload_operations o
         JOIN condition_photo_upload_attempts a ON a.operation_id=o.id
         JOIN vehicle_photo_verifications v ON v.operation_id=o.id AND v.attempt_id=a.id
         WHERE o.valet_session_id=$1 AND o.client_operation_id=$2`,
        [input.scope.sessionId, input.operationId],
      );
      expect(records.rows).toHaveLength(1);
      const row = records.rows[0]!;
      expect(row).toMatchObject({
        actor_membership_id: input.scope.memberId,
        location_id: input.scope.locationId,
        organization_id: input.scope.orgId,
        attempt_status: "SELECTED",
      });
      expect(row.source_sha256).toEqual(
        createHash("sha256").update(input.bytes).digest(),
      );
      const stored = await h.privateStore.readExact({
        key: row.object_key,
        version: row.object_version,
      });
      expect(createHash("sha256").update(stored.bytes).digest()).toEqual(
        row.content_sha256,
      );
      expect(stored.bytes.length).toBe(row.byte_size);
      stored.bytes.fill(0);
      const replay = await h.upload(
        input.scope.sessionId,
        input.authorization,
        input.operationId,
        input.bytes,
      );
      expect(replay.status).toBe(200);
      expect(replay.body).toEqual(uploads[index]!.body);
      const different = await h.upload(
        input.scope.sessionId,
        input.authorization,
        input.operationId,
        inputs[(index + 1) % 3]!.bytes,
      );
      expect(different.status).toBe(409);
      expect(different.body.code).toBe("CONDITION_PHOTO_OPERATION_CONFLICT");
      expect(
        (
          await h.request(
            "POST",
            input.scope.sessionId,
            input.authorization,
            "condition-completion",
            {},
          )
        ).status,
      ).toBe(200);
      const completed = await h.request(
        "POST",
        input.scope.sessionId,
        input.authorization,
        "complete",
        { expectedVersion: 1 },
      );
      expect(completed.status).toBe(200);
      expect(completed.body).toMatchObject({
        state: "AWAITING_PARKING",
        version: 2,
      });
      const audit = await h.db.admin.query(
        `SELECT count(*)::int AS count FROM audit_events WHERE valet_session_id=$1
         AND event_type='CHECK_IN_CONDITION_PHOTO_VERIFIED'`,
        [input.scope.sessionId],
      );
      expect(audit.rows[0]?.count).toBe(1);
    }
  }, 90_000);
  it("concurrent duplicate operation IDs cannot duplicate verified evidence or audit", async () => {
    const { scope, authorization } = await h.seed(true);
    const bytes = await syntheticSizedJpeg(720, 540);
    const operationId = randomUUID();
    const results = await Promise.all([
      h.upload(scope.sessionId, authorization, operationId, bytes),
      h.upload(scope.sessionId, authorization, operationId, bytes),
    ]);
    // A duplicate may observe the live attempt or verified replay; a genuine
    // protected conflict remains permitted. Decoder/storage 503 is not hidden.
    expect(results.some((result) => [200, 201].includes(result.status))).toBe(
      true,
    );
    expect(
      results.every((result) => [200, 201, 409].includes(result.status)),
    ).toBe(true);
    const replay = await h.upload(
      scope.sessionId,
      authorization,
      operationId,
      bytes,
    );
    expect(replay.status).toBe(200);
    const count = await h.db.admin.query(
      `SELECT (SELECT count(*)::int FROM vehicle_photo_verifications WHERE valet_session_id=$1) AS verified,
              (SELECT count(*)::int FROM condition_photo_upload_attempts WHERE valet_session_id=$1 AND status='SELECTED') AS selected,
              (SELECT count(*)::int FROM audit_events WHERE valet_session_id=$1 AND event_type='CHECK_IN_CONDITION_PHOTO_VERIFIED') AS audits`,
      [scope.sessionId],
    );
    expect(count.rows[0]).toEqual({ verified: 1, selected: 1, audits: 1 });
  }, 60_000);
});
