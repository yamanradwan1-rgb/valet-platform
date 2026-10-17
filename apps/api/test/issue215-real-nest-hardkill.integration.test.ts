import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";
import { openIssue215HttpDatabase, type Issue215HttpDatabase } from "./issue215-http-fixture-database";
import { readAttestedIssue215Minio, syntheticJpeg, type S3Fixture } from "./issue215-http-fixture";

type Message = { event: string; baseUrl?: string; key?: string; version?: string; cause?: string };
const childScript = resolve(process.cwd(), "test/issue215-nest-hardkill-child.ts");
const children = new Set<ChildProcess>();
const childDiagnostic = new WeakMap<ChildProcess, string>();

function message(child: ChildProcess, expected: string, maximumMs: number): Promise<Message> {
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => finish(new Error("Owned Nest IPC barrier expired.")), maximumMs);
    const onExit = (code: number | null) => finish(new Error(
      `Owned Nest child closed before ${expected}, status=${String(code)}: ${childDiagnostic.get(child) || "no diagnostic"}`,
    ));
    const onError = () => finish(new Error("Owned Nest child failed before barrier."));
    const onMessage = (value: Message) => {
      if (value?.event === "bootstrap-error")
        finish(new Error(`Owned Nest bootstrap failed: ${value.cause ?? "unknown"}`));
      else if (value?.event === expected) finish(undefined, value);
    };
    function finish(error?: Error, value?: Message) {
      clearTimeout(timer);
      child.off("close", onExit);
      child.off("error", onError);
      child.off("message", onMessage);
      if (error) fail(error);
      else ok(value!);
    }
    child.once("close", onExit);
    child.once("error", onError);
    child.on("message", onMessage);
  });
}

function startNest(databaseUrl: string, s3: S3Fixture, crash: boolean) {
  // This test boots the real compiled Nest controllers in a separate OS
  // process. TypeScript test imports alone cannot supply its constructor
  // metadata or production Contracts runtime entry points.
  for (const compiled of [
    resolve(process.cwd(), "dist/modules/check-in-api/check-in.module.js"),
    resolve(process.cwd(), "dist/modules/vehicle-photos/s3-private-photo-store.js"),
    resolve(process.cwd(), "../../packages/contracts/dist/index.js"),
  ]) {
    if (!existsSync(compiled)) {
      throw new Error("Issue 215 Nest crash test requires built API and Contracts artifacts.");
    }
  }
  const child = spawn(process.execPath, ["--import", "tsx", childScript], {
    cwd: process.cwd(), windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      ...process.env, NODE_ENV: "test", ISSUE215_NEST_CHILD_OWNED: "true",
      ISSUE215_NEST_CHILD_CRASH: crash ? "true" : "false",
      AWS_ACCESS_KEY_ID: s3.accessKeyId, AWS_SECRET_ACCESS_KEY: s3.secretAccessKey,
      AWS_REGION: s3.region, DATABASE_URL: databaseUrl,
      CONDITION_PHOTO_STORAGE_ENABLED: "true",
      CONDITION_PHOTO_PRIVATE_BUCKET: s3.bucket,
      CONDITION_PHOTO_BUCKET_ALIAS: "issue215_local",
      CONDITION_PHOTO_STORAGE_REGION: s3.region,
      CONDITION_PHOTO_STORAGE_ENDPOINT: s3.endpoint,
      CONDITION_PHOTO_ALLOW_TEST_HTTP: "true",
      CONDITION_PHOTO_P3_QUALIFICATION_ENABLED: "true",
      ANTI_ABUSE_HMAC_SECRET_B64URL: createHash("sha256")
        .update(`issue215-nest-owned-${s3.accessKeyId}`).digest("base64url"),
    },
  });
  if (!Number.isInteger(child.pid) || child.pid! <= 0 ||
      child.spawnfile !== process.execPath ||
      !child.spawnargs.includes(childScript))
    throw new Error("Nest child PID or executable identity is not task-owned.");
  childDiagnostic.set(child, "");
  const collect = (chunk: Buffer) => {
    const safe = chunk.toString().replaceAll(databaseUrl, "[DATABASE]")
      .replaceAll(s3.secretAccessKey, "[SECRET]")
      .replace(/postgres(?:ql)?:\/\/\S+/gi, "[DATABASE]");
    childDiagnostic.set(child, (childDiagnostic.get(child) ?? "").concat(safe).slice(-700));
  };
  child.stderr?.on("data", collect);
  child.stdout?.on("data", collect);
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

async function killOwnedNest(child: ChildProcess): Promise<void> {
  if (!children.has(child) || child.spawnfile !== process.execPath ||
      !child.spawnargs.includes(childScript) || !child.pid)
    throw new Error("Refusing to kill a process without exact owned Nest identity.");
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((ok, fail) => {
    const deadline = setTimeout(() => fail(new Error("Owned Nest did not exit.")), 15_000);
    child.once("exit", () => { clearTimeout(deadline); ok(); });
  });
  if (!child.kill("SIGKILL")) throw new Error("Owned Nest hard kill failed.");
  await exited;
}

async function post(base: string, path: string, authorization: string, body: object) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("#285 REAL whole Nest SIGKILL → new Nest replica → durable MinIO journal reconcile", () => {
  let db: Issue215HttpDatabase;
  let s3: S3Fixture;
  let client: S3Client;
  let store: S3PrivatePhotoStore;

  beforeAll(async () => {
    s3 = readAttestedIssue215Minio();
    db = await openIssue215HttpDatabase();
    client = new S3Client({
      endpoint: s3.endpoint, region: s3.region, forcePathStyle: true,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
      maxAttempts: 1,
    });
    store = new S3PrivatePhotoStore({
      endpoint: s3.endpoint, region: s3.region, bucket: s3.bucket,
      bucketAlias: "issue215_local", allowTestHttp: true,
    }, client);
  }, 240_000);

  afterAll(async () => {
    try {
      for (const child of [...children]) await killOwnedNest(child);
    } finally {
      client?.destroy();
      await db?.close();
    }
  }, 90_000);

  it("kills the actual Nest process after exact PUT ACK and reconciles once via a newly booted Nest", async () => {
    const scope = await db.seed(true);
    const initialBearer = await db.createBearer(scope);
    const operationId = randomUUID();
    const first = startNest(db.runtimeUrl, s3, true);
    const ready = await message(first, "ready", 35_000);
    expect(ready.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const operationPath = `/v1/staff/check-in/sessions/${scope.sessionId}`;
    const ack = message(first, "put-acknowledged", 30_000);
    const multipart = new FormData();
    multipart.append("operationId", operationId);
    multipart.append("image", new Blob([new Uint8Array(await syntheticJpeg())],
      { type: "image/jpeg" }), "condition.jpg");
    // The server will hang after the real provider PUT; consume the expected
    // network error after the exact child PID is killed.
    const pendingRequest = fetch(`${ready.baseUrl}${operationPath}/condition-photo-uploads`, {
      method: "POST", headers: { authorization: initialBearer }, body: multipart,
    }).catch(() => undefined);
    const acknowledged = await ack;
    expect(acknowledged.version).toEqual(expect.any(String));

    const t1 = await db.admin.query<{
      attempt_id: string; operation_id: string; object_key: string;
      status: string; attempt_status: string;
    }>(
      `SELECT a.id::text AS attempt_id, o.id::text AS operation_id,
              a.object_key, o.status::text AS status,
              a.status::text AS attempt_status
       FROM condition_photo_upload_operations o
       JOIN condition_photo_upload_attempts a ON a.operation_id=o.id
       WHERE o.client_operation_id=$1 AND o.valet_session_id=$2`,
      [operationId, scope.sessionId],
    );
    expect(t1.rows).toHaveLength(1);
    expect(t1.rows[0]).toMatchObject({
      status: "PENDING", attempt_status: "WRITING",
      object_key: acknowledged.key,
    });
    await killOwnedNest(first);
    await pendingRequest;
    const object = await store.readExact({
      key: t1.rows[0]!.object_key, version: acknowledged.version!,
    });
    expect(object.version).toBe(acknowledged.version);
    expect(createHash("sha256").update(object.bytes).digest("hex")).toMatch(/^[a-f0-9]{64}$/);
    object.bytes.fill(0);

    const expiry = await db.admin.query(
      `UPDATE condition_photo_upload_attempts
       SET lease_expires_at=clock_timestamp()-interval '1 second'
       WHERE id=$1 AND operation_id=$2 AND status='WRITING'`,
      [t1.rows[0]!.attempt_id, t1.rows[0]!.operation_id],
    );
    expect(expiry.rowCount).toBe(1);
    const second = startNest(db.runtimeUrl, s3, false);
    const next = await message(second, "ready", 35_000);
    const newBearer = await db.createBearer(scope);
    const reconciled = await post(next.baseUrl!, `${operationPath}/condition-photo-uploads/${operationId}/reconcile`, newBearer, {});
    expect(reconciled.status).toBe(200);
    expect(reconciled.body).toMatchObject({ status: "VERIFIED", operationId });
    expect((await post(next.baseUrl!,
      `${operationPath}/condition-photo-uploads/${operationId}/reconcile`, newBearer, {})).body)
      .toEqual(reconciled.body);
    const discoveryResponse = await fetch(`${next.baseUrl}${operationPath}/condition-photo-state`, {
      headers: { authorization: newBearer },
    });
    expect(discoveryResponse.status).toBe(200);
    expect(await discoveryResponse.json()).toMatchObject({
      qualifyingPhotoPresent: true,
    });
    expect((await post(next.baseUrl!,
      `${operationPath}/condition-completion`, newBearer, {})).status).toBe(200);
    expect((await post(next.baseUrl!,
      `${operationPath}/complete`, newBearer, { expectedVersion: 1 })).status).toBe(200);
    const proof = await db.admin.query<{
      photos: number; verifications: number; selected: number; audits: number;
      state: string; version: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM vehicle_photos WHERE valet_session_id=$1
           AND purpose='CHECK_IN_CONDITION') AS photos,
         (SELECT count(*)::int FROM vehicle_photo_verifications WHERE valet_session_id=$1) AS verifications,
         (SELECT count(*)::int FROM condition_photo_upload_attempts
           WHERE operation_id=$2 AND status='SELECTED') AS selected,
         (SELECT count(*)::int FROM audit_events WHERE valet_session_id=$1
           AND event_type IN ('CHECK_IN_CONDITION_PHOTO_VERIFIED',
             'VALET_SESSION_CHECK_IN_CONDITION_COMPLETED',
             'VALET_SESSION_CHECK_IN_COMPLETED')) AS audits,
         s.state::text AS state, s.version FROM valet_sessions s WHERE s.id=$1`,
      [scope.sessionId, t1.rows[0]!.operation_id],
    );
    expect(proof.rows[0]).toEqual({
      photos: 1, verifications: 1, selected: 1,
      audits: 3, state: "AWAITING_PARKING", version: 2,
    });
    await killOwnedNest(second);
  }, 120_000);
});
