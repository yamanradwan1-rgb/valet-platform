import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { PoolClient } from "pg";

import type { PostgresPool } from "../src/common/database/postgres";
import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { authorizeSessionPhotoViewWithTestPolicy } from "../src/modules/dashboard/session-photo-authorization";
import { withCommittedPhotoDeliveryFence } from "../src/modules/dashboard/session-photo-delivery-fence";
import {
  lockExactVerifiedPhotoForDelivery,
  verifiedDashboardPhotoCandidates,
} from "../src/modules/dashboard/session-photo-query";
import { syntheticJpeg } from "./issue215-http-fixture";
import type { Issue309PhotoHttpFixture } from "./issue309-photo-http-fixture";

export interface PhotoFenceCase {
  readonly orgId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly memberId: string;
  readonly employeeUserId: string;
  readonly employeeMemberId: string;
  readonly photoId: string;
  readonly credential: StaffSessionContext;
  readonly jpeg: Buffer;
}

export async function seedPhotoFenceCase(h: Issue309PhotoHttpFixture): Promise<PhotoFenceCase> {
  const { scope, authorization: employee } = await h.seedPhoto();
  const response = await h.upload(scope.sessionId, employee, await syntheticJpeg());
  if (response.status !== 201) throw new Error("Disposable photo upload failed.");
  const data = JSON.parse(response.body.toString("utf8")) as { vehiclePhotoId: string };
  const photoId = data.vehiclePhotoId;
  const viewer = await h.createViewer(scope);
  const tokenHash = staffCredentialHash("access", viewer.authorization.slice(7));
  const session = await h.db.admin.query<{ id: string; created_at: Date }>(
    `SELECT id::text,created_at FROM staff_auth_sessions
     WHERE user_id=$1 AND current_access_token_hash=$2`,
    [viewer.userId, tokenHash],
  );
  if (session.rowCount !== 1) throw new Error("Staff auth fixture has no exact session.");
  const object = await h.db.admin.query<{ object_key: string; object_version: string; digest: Buffer }>(
    `SELECT v.object_key,a.object_version,v.content_sha256 AS digest
     FROM vehicle_photo_verifications v JOIN condition_photo_upload_attempts a
       ON a.id=v.attempt_id WHERE v.vehicle_photo_id=$1`, [photoId],
  );
  const row = object.rows[0];
  if (!row?.object_version) throw new Error("Photo object is not versioned.");
  // Actual private S3 bytes are read and digested outside both transactions.
  const stored = await h.privateStore.readExact({ key: row.object_key, version: row.object_version });
  const digest = createHash("sha256").update(stored.bytes).digest();
  if (!digest.equals(row.digest)) throw new Error("Photo digest mismatch.");
  return {
    orgId: scope.orgId,locationId:scope.locationId,sessionId:scope.sessionId,
    userId:viewer.userId,memberId:viewer.memberId,
    employeeUserId:scope.userId,employeeMemberId:scope.memberId,
    photoId, jpeg: stored.bytes,
    credential: {
      userId: viewer.userId,
      staffAuthSessionId: session.rows[0]!.id,
      accessTokenHash: tokenHash,
      createdAt: session.rows[0]!.created_at,
    },
  };
}

export interface FenceHarnessOptions {
  readonly commitAckLost?: boolean;
  readonly witnessLivenessLost?: boolean;
  readonly onWitnessLocked?: () => Promise<void>;
  readonly onBeforeCommitCheck?: () => Promise<void>;
}

export async function runPhotoFenceHttp(
  h: Issue309PhotoHttpFixture,
  item: PhotoFenceCase,
  options: FenceHarnessOptions = {},
): Promise<{ status: number; body: Buffer; calls: number; order: string[] }> {
  const runtime = createRuntimePostgresPool(h.db.runtimeUrl);
  const connect = runtime.connect.bind(runtime);
  const order: string[] = [];
  let checkout = 0;
  let calls = 0;
  const pool = {
    connect: async () => {
      const client = await connect();
      const index = ++checkout;
      const query = client.query.bind(client);
      if (index === 2 && options.commitAckLost) {
        client.query = ((async (...args: Parameters<PoolClient["query"]>) => {
          const response = await Reflect.apply(query, client, args) as unknown;
          if (args[0] === "COMMIT") throw new Error("Simulated lost PostgreSQL COMMIT ACK");
          return response;
        }) as unknown) as PoolClient["query"];
      }
      if (index === 1 && options.witnessLivenessLost) {
        client.query = ((async (...args: Parameters<PoolClient["query"]>) => {
          if (args[0] === "SELECT 1 AS alive") throw new Error("Witness connection lost");
          return await Reflect.apply(query, client, args);
        }) as unknown) as PoolClient["query"];
      }
      return client;
    },
  } as unknown as PostgresPool;
  const verify = async (tx: PoolClient) => {
    calls += 1;
    if (calls === 2) await options.onBeforeCommitCheck?.();
    const scope = await authorizeSessionPhotoViewWithTestPolicy(tx, {
      authenticatedUserId: item.userId,
      staffSessionContext: item.credential,
      targetLocationId: item.locationId,
      targetSessionId: item.sessionId,
    }, { proposedRoles: ["LOCATION_MANAGER"] });
    if (!scope) throw new Error("Photo viewer denied by current authority.");
    const candidates = await verifiedDashboardPhotoCandidates(tx, {location:scope,sessionId:item.sessionId});
    const candidate = candidates.find((photo) => photo.photoId === item.photoId);
    if (!candidate || !(await lockExactVerifiedPhotoForDelivery(
      tx,{location:scope,sessionId:item.sessionId},candidate,
    ))) throw new Error("Photo evidence revoked.");
    if (calls === 1) {
      order.push("witness-locked");
      await options.onWitnessLocked?.();
    }
  };
  let finish!: () => void;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const server = createServer((_request,response) => {
    void withCommittedPhotoDeliveryFence(pool,verify,() => {
      order.push("jpeg-enqueued");
      response.setHeader("Content-Type","image/jpeg");
      response.end(item.jpeg);
    }).catch(() => {
      if (!response.headersSent && !response.destroyed) {
        response.statusCode=503;
        response.end("unavailable");
      }
    }).finally(finish);
  });
  try {
    await new Promise<void>((resolve) => server.listen(0,"127.0.0.1",resolve));
    const port = (server.address() as AddressInfo).port;
    const reply = await fetch(`http://127.0.0.1:${port}/`);
    const result = { status:reply.status, body:Buffer.from(await reply.arrayBuffer()), calls,order };
    await done;
    return result;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await runtime.end();
  }
}
