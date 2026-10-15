import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { authorizeConditionPhotoScope } from "../src/modules/vehicle-photos/condition-photo-authorization";
import { canonicalizeConditionJpeg } from "../src/modules/vehicle-photos/condition-photo-jpeg-decoder";
import { executeConditionPhotoReconcile } from "../src/modules/vehicle-photos/condition-photo-reconcile-executor";
import { readConditionPhotoStatus } from "../src/modules/vehicle-photos/condition-photo-status-query";
import { reserveConditionPhoto } from "../src/modules/vehicle-photos/condition-photo-transactions";
import { executeConditionPhotoUpload } from "../src/modules/vehicle-photos/condition-photo-upload-executor";
import {
  ConditionPhotoStorageError,
  type PrivatePhotoStore,
} from "../src/modules/vehicle-photos/private-photo-store";
import {
  Issue215RecoveryDatabase,
  recoveryDatabaseIsExplicitlyOwned,
  type RecoveryFixture,
} from "./issue215-recovery-fixture";
import { Issue215RecoveryStore } from "./issue215-recovery-store";

// No implicit DATABASE_URL, production DB, or unowned storage is touched.
// Explicit opt-in requires a task-owned local PostgreSQL admin server.
describe.runIf(recoveryDatabaseIsExplicitlyOwned())(
  "#285 real PostgreSQL recovery with deterministic S3 HTTP fault barriers",
  () => {
    let db: Issue215RecoveryDatabase;
    let storage: Issue215RecoveryStore;

    beforeAll(async () => {
      db = new Issue215RecoveryDatabase();
      await db.start();
      storage = new Issue215RecoveryStore();
      await storage.start();
    }, 180_000);

    afterAll(async () => {
      try {
        await storage?.close();
      } finally {
        await db?.close();
      }
    }, 90_000);

    const jpeg = async () => sharp({
      create: { width: 16, height: 16, channels: 3,
        background: { r: 30, g: 70, b: 120 } },
    }).jpeg().toBuffer();

    async function status(fixture: RecoveryFixture, operationId: string) {
      return inPostgresTransaction(db.runtimePool, async (tx) => {
        const scope = await authorizeConditionPhotoScope(
          tx, fixture.credential, fixture.sessionId,
        );
        return readConditionPhotoStatus(tx, scope, operationId);
      });
    }

    async function expireAttempt(operationId: string): Promise<void> {
      const updated = await db.adminPool.query(
        `UPDATE condition_photo_upload_attempts SET
           lease_expires_at = clock_timestamp() - interval '1 second'
         WHERE operation_id = (
           SELECT id FROM condition_photo_upload_operations
           WHERE client_operation_id = $1 AND status = 'PENDING'
         ) AND status IN ('WRITING','STORED')`,
        [operationId],
      );
      expect(updated.rowCount).toBe(1);
    }

    async function counts(fixture: RecoveryFixture, operationId: string) {
      const result = await db.adminPool.query<{
        photos: number; verifications: number; audits: number; selected: number;
      }>(
        `SELECT
          (SELECT count(*)::int FROM vehicle_photos
           WHERE valet_session_id = $1 AND purpose = 'CHECK_IN_CONDITION') AS photos,
          (SELECT count(*)::int FROM vehicle_photo_verifications
           WHERE valet_session_id = $1) AS verifications,
          (SELECT count(*)::int FROM audit_events
           WHERE valet_session_id = $1
             AND event_type = 'CHECK_IN_CONDITION_PHOTO_VERIFIED') AS audits,
          (SELECT count(*)::int FROM condition_photo_upload_attempts
           WHERE operation_id = (
             SELECT id FROM condition_photo_upload_operations
             WHERE client_operation_id = $2
           ) AND status = 'SELECTED') AS selected`,
        [fixture.sessionId, operationId],
      );
      return result.rows[0]!;
    }

    async function killAfterPut(fixture: RecoveryFixture, operationId: string, bytes: Buffer) {
      // T1 must durably complete before any network I/O by the crashable child.
      const canonical = await canonicalizeConditionJpeg(bytes);
      const reserved = await reserveConditionPhoto(
        db.runtimePool, fixture.credential, fixture.sessionId, operationId,
        canonical.sourceSha256, canonical.sourceByteSize, storage.bucketAlias,
      );
      const lease = reserved.lease;
      if (!lease) throw new Error("No durable T1 recovery lease.");
      const path = resolve(process.cwd(), "test/issue215-recovery-crash-child.ts");
      const child = spawn(process.execPath, ["--import", "tsx", path], {
        cwd: process.cwd(), windowsHide: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: { ...process.env, NODE_ENV: "test" },
      });
      let observedKey = "";
      let failure = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        failure = (failure + chunk.toString()).slice(-1000);
      });
      let teardownFailure: Error | undefined;
      try {
        observedKey = await new Promise<string>((ok, fail) => {
          const timer = setTimeout(() => fail(new Error("Child PUT ACK barrier timed out.")), 30_000);
          child.once("error", (error) => { clearTimeout(timer); fail(error); });
          child.once("exit", (code) => {
            clearTimeout(timer);
            fail(new Error(`Child exited before PUT barrier (${String(code)}): ${failure}`));
          });
          child.on("message", (message: { event: string; key?: string }) => {
            if (message.event === "put-acknowledged" && message.key) {
              clearTimeout(timer);
              ok(message.key);
            } else {
              clearTimeout(timer);
              fail(new Error("Child failed before storage ACK."));
            }
          });
          child.send({
            key: lease.object_key,
            canonicalJpeg: canonical.canonicalBytes.toString("base64"),
            endpoint: storage.endpoint, bucket: storage.config.bucket,
            bucketAlias: storage.bucketAlias,
            accessKeyId: "TEST_ONLY", secretAccessKey: "TEST_ONLY",
          });
        });
      } finally {
        if (child.exitCode === null) {
          const exited = new Promise<void>((ok) =>
            child.once("exit", () => ok()));
          if (!child.kill("SIGKILL")) {
            teardownFailure = new Error("Could not terminate owned crash fixture child.");
          } else {
            try {
              await Promise.race([
                exited,
                new Promise<never>((_, fail) =>
                  setTimeout(() => fail(new Error("Owned child failed to exit.")), 10_000)),
              ]);
            } catch (error) {
              teardownFailure = error as Error;
            }
          }
        }
      }
      if (teardownFailure) throw teardownFailure;
      canonical.canonicalBytes.fill(0);
      return observedKey;
    }

    it("kills uploader PID after real signed PUT, then a fresh replica reconciles exactly once", async () => {
      const fixture = await db.fixture();
      const operationId = randomUUID();
      let key = "";
      try {
        key = await killAfterPut(fixture, operationId, await jpeg());
      } catch (error) {
        // Keep the original error readable if Vitest's Windows sourcemap
        // handler itself raises while formatting this child-process failure.
        const classification = error instanceof Error ?
          error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[DB]").slice(0, 220) :
          "non-Error rejection";
        process.stderr.write(`Issue215 owned child fixture: ${classification}\n`);
        throw error;
      }
      expect(storage.has(key)).toBe(true);
      expect(await status(fixture, operationId)).toMatchObject({
        status: "PENDING", retryAction: "WAIT",
      });
      expect(await counts(fixture, operationId)).toEqual({
        photos: 0, verifications: 0, audits: 0, selected: 0,
      });
      await expireAttempt(operationId);
      expect(await status(fixture, operationId)).toMatchObject({
        status: "PENDING", retryAction: "RECONCILE",
      });
      const refreshed = await db.newCredential(fixture.userId);
      const replica = createRuntimePostgresPool(db.runtimeUrl);
      try {
        const verified = await executeConditionPhotoReconcile(
          replica, storage.store, storage.bucketAlias, refreshed,
          fixture.sessionId, operationId,
        );
        expect(verified.status).toBe("VERIFIED");
        expect(await executeConditionPhotoReconcile(
          db.runtimePool, storage.store, storage.bucketAlias, fixture.credential,
          fixture.sessionId, operationId,
        )).toEqual(verified);
        expect(await counts(fixture, operationId)).toEqual({
          photos: 1, verifications: 1, audits: 1, selected: 1,
        });
      } finally {
        await replica.end();
      }
    }, 75_000);

    it("survives timeout after committed PUT and fences second replica during GET", async () => {
      const fixture = await db.fixture();
      const operationId = randomUUID();
      const unknownStore: PrivatePhotoStore = {
        ...storage.store,
        putIfAbsent: async (key, bytes, deadline) => {
          await storage.store.putIfAbsent(key, bytes, deadline);
          throw new ConditionPhotoStorageError("UNKNOWN");
        },
        readExact: (item, deadline) => storage.store.readExact(item, deadline),
        statExact: (item, deadline) => storage.store.statExact(item, deadline),
        deleteAbandonedExact: (item) => storage.store.deleteAbandonedExact(item),
      };
      await expect(executeConditionPhotoUpload(
        db.runtimePool, unknownStore, storage.bucketAlias,
        fixture.credential, fixture.sessionId, operationId, await jpeg(),
      )).rejects.toMatchObject({ code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE" });
      const failure = await db.adminPool.query<{ last_failure_code: string }>(
        `SELECT last_failure_code FROM condition_photo_upload_operations
         WHERE client_operation_id = $1`, [operationId],
      );
      expect(failure.rows[0]?.last_failure_code).toBe("STORAGE_OUTCOME_UNKNOWN");
      await expireAttempt(operationId);
      let reach!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((ok) => { reach = ok; });
      const held = new Promise<void>((ok) => { release = ok; });
      storage.blockNextRead(reach, held);
      const replica = createRuntimePostgresPool(db.runtimeUrl);
      try {
        const first = executeConditionPhotoReconcile(
          replica, storage.store, storage.bucketAlias, fixture.credential,
          fixture.sessionId, operationId,
        );
        await reached;
        const second = await executeConditionPhotoReconcile(
          db.runtimePool, storage.store, storage.bucketAlias, fixture.credential,
          fixture.sessionId, operationId,
        );
        expect(second).toMatchObject({ status: "PENDING", retryAction: "WAIT" });
        release();
        expect((await first).status).toBe("VERIFIED");
        expect(await counts(fixture, operationId)).toEqual({
          photos: 1, verifications: 1, audits: 1, selected: 1,
        });
      } finally {
        release();
        await replica.end();
      }
    }, 60_000);

    it("unknown absent object stays pending, never invents a verified photo or blind resend", async () => {
      const fixture = await db.fixture();
      const operationId = randomUUID();
      const source = await jpeg();
      const reservation = await reserveConditionPhoto(
        db.runtimePool, fixture.credential, fixture.sessionId, operationId,
        createHash("sha256").update(source).digest(), source.length,
        storage.bucketAlias,
      );
      expect(reservation.lease).toBeDefined();
      expect(storage.has(reservation.lease!.object_key)).toBe(false);
      await expireAttempt(operationId);
      const missing = await executeConditionPhotoReconcile(
        db.runtimePool, storage.store, storage.bucketAlias, fixture.credential,
        fixture.sessionId, operationId,
      );
      expect(missing).toMatchObject({ status: "PENDING", retryAction: "WAIT" });
      expect(await status(fixture, operationId)).toMatchObject({
        status: "PENDING", retryAction: "WAIT",
      });
      expect(await counts(fixture, operationId)).toEqual({
        photos: 0, verifications: 0, audits: 0, selected: 0,
      });
    });
  },
);
