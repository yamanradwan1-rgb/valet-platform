import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { canonicalizeConditionJpeg } from "../src/modules/vehicle-photos/condition-photo-jpeg-decoder";
import { executeConditionPhotoReconcile } from "../src/modules/vehicle-photos/condition-photo-reconcile-executor";
import { reserveConditionPhoto } from "../src/modules/vehicle-photos/condition-photo-transactions";
import { executeConditionPhotoUpload } from "../src/modules/vehicle-photos/condition-photo-upload-executor";
import {
  ConditionPhotoStorageError,
  type PrivatePhotoStore,
} from "../src/modules/vehicle-photos/private-photo-store";
import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";
import { Issue215RecoveryDatabase, recoveryDatabaseIsExplicitlyOwned } from "./issue215-recovery-fixture";
import {
  proveRecoveryRealMinio,
  type RealStorageIdentity,
} from "./issue215-recovery-minio-target";

const realEnabled = process.env.ISSUE215_REAL_S3_ENABLED === "true";
const pgEnabled = recoveryDatabaseIsExplicitlyOwned();

// Isolated MinIO and isolated PostgreSQL are BOTH required. No ambient DATABASE_URL
// or arbitrary S3 endpoint may enable this cross-replica crash qualification.
describe.runIf(realEnabled && pgEnabled)(
  "#285 actual MinIO PUT → hard subprocess crash → PostgreSQL replica reconcile",
  () => {
    let db: Issue215RecoveryDatabase;
    let store: S3PrivatePhotoStore;
    let real: RealStorageIdentity;
    const bucketAlias = "issue215_local";

    beforeAll(async () => {
      real = proveRecoveryRealMinio();
      db = new Issue215RecoveryDatabase();
      await db.start();
      const client = new S3Client({
        region: "us-east-1", endpoint: real.endpoint,
        forcePathStyle: true, maxAttempts: 1,
        credentials: {
          accessKeyId: real.accessKeyId,
          secretAccessKey: real.secretAccessKey,
        },
      });
      store = new S3PrivatePhotoStore({
        bucket: real.bucket, bucketAlias, endpoint: real.endpoint,
        region: "us-east-1", allowTestHttp: true,
      }, client);
    }, 180_000);

    afterAll(async () => db?.close(), 90_000);

    async function hardKillAfterPut(key: string, bytes: Buffer): Promise<void> {
      const entry = resolve(process.cwd(), "test/issue215-recovery-crash-child.ts");
      const child = spawn(process.execPath, ["--import", "tsx", entry], {
        cwd: process.cwd(), windowsHide: true,
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        env: { ...process.env, NODE_ENV: "test" },
      });
      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-500);
      });
      let cleanupFailure: Error | undefined;
      try {
        await new Promise<void>((ok, fail) => {
          const timer = setTimeout(
            () => fail(new Error("Real MinIO subprocess PUT ACK barrier expired.")), 25_000,
          );
          child.once("error", (error) => {
            clearTimeout(timer);
            fail(error);
          });
          child.once("exit", (code) => {
            clearTimeout(timer);
            fail(new Error(`Child terminated before MinIO PUT ACK: ${String(code)}; ${stderr.slice(0, 180)}`));
          });
          child.on("message", (message: { event?: string; key?: string }) => {
            clearTimeout(timer);
            if (message.event === "put-acknowledged" && message.key === key)
              ok();
            else fail(new Error("Child did not acknowledge exact MinIO object PUT."));
          });
          child.send({
            key,
            canonicalJpeg: bytes.toString("base64"),
            endpoint: real.endpoint, bucket: real.bucket, bucketAlias,
            accessKeyId: real.accessKeyId, secretAccessKey: real.secretAccessKey,
          });
        });
      } finally {
        if (child.exitCode === null) {
          const exited = new Promise<void>((ok) => child.once("exit", () => ok()));
          if (!child.kill("SIGKILL")) {
            cleanupFailure = new Error("Could not kill task-owned S3 child.");
          } else {
            try {
              await Promise.race([
                exited,
                new Promise<never>((_, fail) => setTimeout(
                  () => fail(new Error("Task-owned child did not exit.")), 10_000,
                )),
              ]);
            } catch (error) {
              cleanupFailure = error as Error;
            }
          }
        }
      }
      if (cleanupFailure) throw cleanupFailure;
    }

    it("restores actual versioned immutable JPEG after crash and fresh authorized replica", async () => {
      const fixture = await db.fixture();
      const operationId = randomUUID();
      const jpeg = await sharp({
        create: { width: 16, height: 16, channels: 3,
          background: { r: 85, g: 102, b: 122 } },
      }).jpeg().toBuffer();
      const canonical = await canonicalizeConditionJpeg(jpeg);
      try {
        const reservation = await reserveConditionPhoto(
          db.runtimePool, fixture.credential, fixture.sessionId,
          operationId, canonical.sourceSha256, canonical.sourceByteSize, bucketAlias,
        );
        const lease = reservation.lease;
        if (!lease) throw new Error("Expected a committed T1 upload attempt.");
        await hardKillAfterPut(lease.object_key, canonical.canonicalBytes);

        const object = await store.statExact({ key: lease.object_key, version: null });
        expect(object.exists).toBe(true);
        if (!object.exists || !("version" in object) || !object.version)
          throw new Error("MinIO did not return the exact immutable object version.");
        const persisted = await store.readExact({ key: lease.object_key, version: object.version });
        expect(persisted.bytes).toEqual(canonical.canonicalBytes);
        persisted.bytes.fill(0);

        // Advance time ONLY for the unique attempt inside the task-created
        // disposable PostgreSQL fixture. Production functions are untouched.
        const expiry = await db.adminPool.query(
          `UPDATE condition_photo_upload_attempts
           SET lease_expires_at = clock_timestamp() - interval '1 second'
           WHERE id = $1 AND operation_id = $2 AND status = 'WRITING'`,
          [lease.attempt_id, lease.operation_id],
        );
        expect(expiry.rowCount).toBe(1);
        const newCredential = await db.newCredential(fixture.userId);
        const secondReplica = createRuntimePostgresPool(db.runtimeUrl);
        try {
          const verified = await executeConditionPhotoReconcile(
            secondReplica, store, bucketAlias, newCredential,
            fixture.sessionId, operationId,
          );
          expect(verified.status).toBe("VERIFIED");
          expect(await executeConditionPhotoReconcile(
            db.runtimePool, store, bucketAlias, fixture.credential,
            fixture.sessionId, operationId,
          )).toEqual(verified);
          const count = await db.adminPool.query<{
            photos: number; facts: number; selected: number; audits: number;
          }>(
            `SELECT
              (SELECT count(*)::int FROM vehicle_photos WHERE valet_session_id = $1
                AND purpose = 'CHECK_IN_CONDITION') AS photos,
              (SELECT count(*)::int FROM vehicle_photo_verifications
                WHERE valet_session_id = $1 AND object_key = $2) AS facts,
              (SELECT count(*)::int FROM condition_photo_upload_attempts
                WHERE operation_id = $3 AND status = 'SELECTED') AS selected,
              (SELECT count(*)::int FROM audit_events WHERE valet_session_id = $1
                AND event_type = 'CHECK_IN_CONDITION_PHOTO_VERIFIED') AS audits`,
            [fixture.sessionId, lease.object_key, lease.operation_id],
          );
          expect(count.rows[0]).toEqual({
            photos: 1, facts: 1, selected: 1, audits: 1,
          });
        } finally {
          await secondReplica.end();
        }
      } finally {
        canonical.canonicalBytes.fill(0);
      }
    }, 90_000);

    it("reconciles real MinIO object after committed PUT's simulated lost acknowledgment", async () => {
      const fixture = await db.fixture();
      const operationId = randomUUID();
      const jpeg = await sharp({
        create: { width: 16, height: 16, channels: 3,
          background: { r: 92, g: 40, b: 200 } },
      }).jpeg().toBuffer();
      const committedUnknown: PrivatePhotoStore = {
        putIfAbsent: async (key, bytes, timeout) => {
          await store.putIfAbsent(key, bytes, timeout);
          // The real MinIO object/version exists, but this task-owned adapter
          // faults the delivery path before T2 can begin.
          throw new ConditionPhotoStorageError("UNKNOWN");
        },
        readExact: (object, timeout) => store.readExact(object, timeout),
        statExact: (object, timeout) => store.statExact(object, timeout),
        deleteAbandonedExact: (object) => store.deleteAbandonedExact(object),
      };
      await expect(executeConditionPhotoUpload(
        db.runtimePool, committedUnknown, bucketAlias, fixture.credential,
        fixture.sessionId, operationId, jpeg,
      )).rejects.toMatchObject({ code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE" });
      const pending = await db.adminPool.query<{
        id: string; last_failure_code: string; attempt_id: string; object_key: string;
      }>(
        `SELECT o.id::text, o.last_failure_code,
                a.id::text AS attempt_id, a.object_key
         FROM condition_photo_upload_operations o
         JOIN condition_photo_upload_attempts a ON a.operation_id = o.id
         WHERE o.client_operation_id = $1 AND o.status = 'PENDING'
           AND a.status = 'WRITING'`,
        [operationId],
      );
      const previous = pending.rows[0];
      expect(previous?.last_failure_code).toBe("STORAGE_OUTCOME_UNKNOWN");
      expect(previous).toBeDefined();
      const versioned = await store.statExact({ key: previous!.object_key, version: null });
      expect(versioned.exists).toBe(true);
      expect("version" in versioned && versioned.version).toBeTruthy();
      // Only the generated disposable test database is advanced by one TTL.
      const expiry = await db.adminPool.query(
        `UPDATE condition_photo_upload_attempts
         SET lease_expires_at = clock_timestamp() - interval '1 second'
         WHERE id = $1 AND operation_id = $2 AND status = 'WRITING'`,
        [previous!.attempt_id, previous!.id],
      );
      expect(expiry.rowCount).toBe(1);
      const fresh = await db.newCredential(fixture.userId);
      const replica = createRuntimePostgresPool(db.runtimeUrl);
      try {
        const recovered = await executeConditionPhotoReconcile(
          replica, store, bucketAlias, fresh, fixture.sessionId, operationId,
        );
        expect(recovered.status).toBe("VERIFIED");
        const counts = await db.adminPool.query<{
          photos: number; facts: number; audits: number; selected: number;
        }>(
          `SELECT
            (SELECT count(*)::int FROM vehicle_photos WHERE valet_session_id = $1
              AND purpose = 'CHECK_IN_CONDITION') AS photos,
            (SELECT count(*)::int FROM vehicle_photo_verifications
              WHERE valet_session_id = $1) AS facts,
            (SELECT count(*)::int FROM audit_events WHERE valet_session_id = $1
              AND event_type = 'CHECK_IN_CONDITION_PHOTO_VERIFIED') AS audits,
            (SELECT count(*)::int FROM condition_photo_upload_attempts
              WHERE operation_id = $2 AND status = 'SELECTED') AS selected`,
          [fixture.sessionId, previous!.id],
        );
        expect(counts.rows[0]).toEqual({
          photos: 1, facts: 1, audits: 1, selected: 1,
        });
      } finally {
        await replica.end();
      }
    }, 60_000);
  },
);
