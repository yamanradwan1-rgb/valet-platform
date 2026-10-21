import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { syntheticJpeg } from "./issue215-http-fixture";
import {
  openIssue309PhotoHttpFixture,
  type Issue309PhotoHttpFixture,
} from "./issue309-photo-http-fixture";

interface PhotoManifest {
  readonly items: Array<{
    readonly photoId: string;
    readonly verifiedAt: string;
    readonly contentType: string;
  }>;
}

function manifestPath(locationId: string, sessionId: string): string {
  return `/v1/staff/dashboard/locations/${locationId}/sessions/${sessionId}/condition-photos`;
}

function photoPath(locationId: string, sessionId: string, photoId: string): string {
  return `${manifestPath(locationId, sessionId)}/${photoId}/bytes`;
}

function decode(buffer: Buffer): Record<string, unknown> {
  return JSON.parse(buffer.toString("utf8")) as Record<string, unknown>;
}

function digest(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("#309 live PostgreSQL and private versioned MinIO dashboard photo reads", () => {
  let h: Issue309PhotoHttpFixture;
  beforeAll(async () => {
    h = await openIssue309PhotoHttpFixture({ hypotheticalApprovedRoles: true });
  }, 240_000);
  afterAll(async () => { await h?.close(); }, 90_000);

  it("lists only persisted VERIFIED+SELECTED+AVAILABLE Check-In evidence, then reads exact JPEG", async () => {
    const { scope, authorization: employeeBearer } = await h.seedPhoto();
    const original = await syntheticJpeg();
    const saved = await h.upload(scope.sessionId, employeeBearer, original);
    expect(saved.status).toBe(201);
    const upload = decode(saved.body);
    expect(upload.status).toBe("VERIFIED");
    const viewer = await h.createViewer(scope);
    const manifest = await h.get(manifestPath(scope.locationId, scope.sessionId), viewer.authorization);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("cache-control")).toContain("no-store");
    const list = decode(manifest.body) as unknown as PhotoManifest;
    expect(list.items).toHaveLength(1);
    const item = list.items[0]!;
    expect(item).toMatchObject({
      photoId: upload.vehiclePhotoId,
      contentType: "image/jpeg",
    });
    expect(new Date(item.verifiedAt).toISOString()).toBe(item.verifiedAt);
    expect(JSON.stringify(list)).not.toMatch(/objectKey|object_key|bucket|sha256|versionId/i);

    const stored = await h.db.admin.query<{
      object_key: string; object_version: string; byte_size: number;
      content_sha256: Buffer; availability: string; status: string;
      selected: string;
    }>(`
      SELECT v.object_key, a.object_version, v.byte_size, v.content_sha256,
        av.state::text AS availability, o.status::text AS status,
        a.status::text AS selected
      FROM vehicle_photo_verifications AS v
      JOIN condition_photo_upload_operations AS o ON o.id=v.operation_id
      JOIN condition_photo_upload_attempts AS a ON a.id=v.attempt_id
      JOIN vehicle_photo_availability AS av ON av.vehicle_photo_id=v.vehicle_photo_id
      WHERE v.vehicle_photo_id=$1 AND v.organization_id=$2
        AND v.location_id=$3 AND v.valet_session_id=$4
    `, [item.photoId, scope.orgId, scope.locationId, scope.sessionId]);
    expect(stored.rows).toHaveLength(1);
    const evidence = stored.rows[0]!;
    expect(evidence).toMatchObject({
      availability: "AVAILABLE", status: "VERIFIED", selected: "SELECTED",
    });
    expect(evidence.object_version).toBeTruthy();
    const read = await h.get(photoPath(scope.locationId, scope.sessionId, item.photoId),
      viewer.authorization);
    expect(read.status).toBe(200);
    expect(read.headers.get("content-type")).toContain("image/jpeg");
    expect(read.headers.get("cache-control")).toContain("no-store");
    expect(read.body.length).toBe(evidence.byte_size);
    expect(digest(read.body)).toBe(evidence.content_sha256.toString("hex"));
    const exact = await h.privateStore.readExact({
      key: evidence.object_key, version: evidence.object_version,
    });
    expect(digest(read.body)).toBe(digest(exact.bytes));
    exact.bytes.fill(0);
  }, 90_000);

  it("denies foreign tenants, wrong session/photo identifiers and ungranted viewer", async () => {
    const own = await h.seedPhoto();
    expect((await h.upload(own.scope.sessionId, own.authorization,
      await syntheticJpeg())).status).toBe(201);
    const foreign = await h.seedPhoto();
    const viewer = await h.createViewer(foreign.scope);
    const ownViewer = await h.createViewer(own.scope, false);
    const wrongManifest = await h.get(
      manifestPath(own.scope.locationId, own.scope.sessionId), viewer.authorization);
    expect([403, 404]).toContain(wrongManifest.status);
    const denied = await h.get(
      manifestPath(own.scope.locationId, own.scope.sessionId), ownViewer.authorization);
    expect([403, 404]).toContain(denied.status);
    const allowed = await h.createViewer(own.scope);
    const wrongSession = await h.get(
      manifestPath(own.scope.locationId, foreign.scope.sessionId), allowed.authorization);
    expect([403, 404]).toContain(wrongSession.status);
    const wrongPhoto = await h.get(
      photoPath(own.scope.locationId, own.scope.sessionId, randomUUID()),
      allowed.authorization);
    expect([403, 404]).toContain(wrongPhoto.status);
    for (const response of [wrongManifest, denied, wrongSession, wrongPhoto])
      expect(JSON.stringify(decode(response.body))).not.toMatch(/object_key|bucket|version/i);
  }, 90_000);

  it("fences a revoked Location grant before subsequent manifest and byte reads", async () => {
    const { scope, authorization: employeeBearer } = await h.seedPhoto();
    const upload = await h.upload(scope.sessionId, employeeBearer, await syntheticJpeg());
    expect(upload.status).toBe(201);
    const photoId = String(decode(upload.body).vehiclePhotoId);
    const viewer = await h.createViewer(scope);
    const path = manifestPath(scope.locationId, scope.sessionId);
    expect((await h.get(path, viewer.authorization)).status).toBe(200);
    await h.db.admin.query(
      `DELETE FROM membership_location_access WHERE organization_id=$1
       AND membership_id=$2 AND location_id=$3`,
      [scope.orgId, viewer.memberId, scope.locationId],
    );
    const [manifest, image] = await Promise.all([
      h.get(path, viewer.authorization),
      h.get(photoPath(scope.locationId, scope.sessionId, photoId), viewer.authorization),
    ]);
    expect([403, 404]).toContain(manifest.status);
    expect([403, 404]).toContain(image.status);
    expect(manifest.headers.get("cache-control")).toContain("no-store");
    expect(image.headers.get("cache-control")).toContain("no-store");
    expect(image.headers.get("content-type")).not.toContain("image/jpeg");
  }, 90_000);

  it("concurrent authorized manifest and bytes reads preserve exact evidence", async () => {
    const { scope, authorization } = await h.seedPhoto();
    const upload = await h.upload(scope.sessionId, authorization, await syntheticJpeg());
    expect(upload.status).toBe(201);
    const photoId = String(decode(upload.body).vehiclePhotoId);
    const viewer = await h.createViewer(scope);
    const calls = Array.from({ length: 4 }, (_, index) => h.get(
      index % 2 === 0
        ? manifestPath(scope.locationId, scope.sessionId)
        : photoPath(scope.locationId, scope.sessionId, photoId),
      viewer.authorization,
    ));
    const results = await Promise.all(calls);
    expect(results.map((item) => item.status)).toEqual([200, 200, 200, 200]);
    expect(results[1]!.body.equals(results[3]!.body)).toBe(true);
    const persisted = await h.db.admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM vehicle_photo_verifications
       WHERE valet_session_id=$1`, [scope.sessionId],
    );
    expect(persisted.rows[0]?.count).toBe(1);
  }, 90_000);

  it("hides evidence when availability is downgraded without leaking stored bytes", async () => {
    const { scope, authorization } = await h.seedPhoto();
    const upload = await h.upload(scope.sessionId, authorization, await syntheticJpeg());
    expect(upload.status).toBe(201);
    const photoId = String(decode(upload.body).vehiclePhotoId);
    const viewer = await h.createViewer(scope);
    await h.db.admin.query(
      `SELECT condition_photo_set_availability(
         $1::uuid,$2::uuid,$3::uuid,'UNAVAILABLE'::condition_photo_availability_state,
         'PROVIDER_INTEGRITY_LOSS'::text)`,
      [scope.userId, scope.memberId, photoId],
    );
    const manifest = await h.get(
      manifestPath(scope.locationId, scope.sessionId), viewer.authorization);
    expect(manifest.status).toBe(200);
    expect(decode(manifest.body).items).toEqual([]);
    const photo = await h.get(
      photoPath(scope.locationId, scope.sessionId, photoId), viewer.authorization);
    expect([403, 404]).toContain(photo.status);
    expect(photo.headers.get("content-type")).not.toContain("image/jpeg");
  }, 90_000);
});
