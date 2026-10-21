import "reflect-metadata";

import { randomBytes, randomUUID } from "node:crypto";

import { S3Client } from "@aws-sdk/client-s3";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import type { PostgresPool } from "../src/common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { CheckInModule } from "../src/modules/check-in-api/check-in.module";
import { DashboardModule } from "../src/modules/dashboard/dashboard.module";
import { DashboardSessionPhotoAdmission } from "../src/modules/dashboard/session-photo-admission";
import { authorizeSessionPhotoViewWithTestPolicy } from "../src/modules/dashboard/session-photo-authorization";
import {
  DashboardSessionPhotoService,
  deliverManagementSessionPhotoBytes,
  listManagementSessionPhotos,
  type SessionPhotoReadDependencies,
} from "../src/modules/dashboard/session-photo-service";
import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";
import {
  openIssue215HttpDatabase,
  type Issue215HttpDatabase,
  type Issue215HttpScope,
} from "./issue215-http-fixture-database";
import { readAttestedIssue215Minio } from "./issue215-http-fixture";

const environmentKeys = [
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "DATABASE_URL",
  "CONDITION_PHOTO_STORAGE_ENABLED", "CONDITION_PHOTO_PRIVATE_BUCKET",
  "CONDITION_PHOTO_BUCKET_ALIAS", "CONDITION_PHOTO_STORAGE_REGION",
  "CONDITION_PHOTO_STORAGE_ENDPOINT", "CONDITION_PHOTO_ALLOW_TEST_HTTP",
  "CONDITION_PHOTO_P3_QUALIFICATION_ENABLED", "ANTI_ABUSE_HMAC_SECRET_B64URL",
] as const;

interface HttpResult {
  readonly status: number;
  readonly headers: Headers;
  readonly body: Buffer;
}

export interface Issue309PhotoHttpFixture {
  readonly db: Issue215HttpDatabase;
  readonly privateStore: S3PrivatePhotoStore;
  seedPhoto(): Promise<{ scope: Issue215HttpScope; authorization: string }>;
  createViewer(scope: Issue215HttpScope, grant?: boolean): Promise<{
    readonly userId: string;
    readonly memberId: string;
    readonly authorization: string;
  }>;
  upload(sessionId: string, authorization: string, bytes: Buffer): Promise<HttpResult>;
  get(path: string, authorization?: string): Promise<HttpResult>;
  close(): Promise<void>;
}

export async function openIssue309PhotoHttpFixture(
  options: { readonly hypotheticalApprovedRoles?: boolean } = {},
): Promise<Issue309PhotoHttpFixture> {
  // The #215 fixture refuses unattested containers and confirms the pinned
  // private versioned bucket *before* a PostgreSQL database can be created.
  const s3 = readAttestedIssue215Minio();
  const db = await openIssue215HttpDatabase();
  const oldEnv = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  let app: INestApplication | undefined;
  let client: S3Client | undefined;
  try {
    Object.assign(process.env, {
      AWS_ACCESS_KEY_ID: s3.accessKeyId,
      AWS_SECRET_ACCESS_KEY: s3.secretAccessKey,
      AWS_REGION: s3.region,
      DATABASE_URL: db.runtimeUrl,
      CONDITION_PHOTO_STORAGE_ENABLED: "true",
      CONDITION_PHOTO_PRIVATE_BUCKET: s3.bucket,
      CONDITION_PHOTO_BUCKET_ALIAS: "issue215_local",
      CONDITION_PHOTO_STORAGE_REGION: s3.region,
      CONDITION_PHOTO_STORAGE_ENDPOINT: s3.endpoint,
      CONDITION_PHOTO_ALLOW_TEST_HTTP: "true",
      CONDITION_PHOTO_P3_QUALIFICATION_ENABLED: "true",
      ANTI_ABUSE_HMAC_SECRET_B64URL: randomBytes(32).toString("base64url"),
    });
    @Module({ imports: [CheckInModule, DashboardModule] })
    class Issue309PhotoTestModule {}
    app = await NestFactory.create(Issue309PhotoTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const baseUrl = await app.getUrl();
    client = new S3Client({
      endpoint: s3.endpoint, region: s3.region, forcePathStyle: true,
      maxAttempts: 1,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    });
    const privateStore = new S3PrivatePhotoStore({
      endpoint: s3.endpoint, region: s3.region, bucket: s3.bucket,
      bucketAlias: "issue215_local", allowTestHttp: true,
    }, client);
    if (options.hypotheticalApprovedRoles === true) {
      // Scoped fixture-only DI: production policy remains DENY on every route.
      // Test permission uses the exported W3 proposal evaluator and actual
      // Staff session, PostgreSQL, S3, authorization fences and HTTP controller.
      const photoService = app.get(DashboardSessionPhotoService);
      const dependencies: SessionPhotoReadDependencies = {
        pool: app.get<PostgresPool>(RUNTIME_POSTGRES_POOL),
        admission: app.get(DashboardSessionPhotoAdmission),
        storage: { config: { bucketAlias: "issue215_local" }, store: privateStore },
        authorize: (tx, input) => authorizeSessionPhotoViewWithTestPolicy(
          tx, input, { proposedRoles: ["LOCATION_MANAGER"] },
        ),
      };
      photoService.list = (request) => listManagementSessionPhotos(dependencies, request);
      photoService.deliver = (request, photoId, syncSend) =>
        deliverManagementSessionPhotoBytes(dependencies, request, photoId, syncSend);
    }
    async function request(method: "GET" | "POST", path: string,
      authorization?: string, form?: FormData): Promise<HttpResult> {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: authorization === undefined ? {} : { authorization },
        ...(form === undefined ? {} : { body: form }),
      });
      return {
        status: response.status, headers: response.headers,
        body: Buffer.from(await response.arrayBuffer()),
      };
    }
    return {
      db, privateStore,
      async seedPhoto() {
        const scope = await db.seed(true);
        return { scope, authorization: await db.createBearer(scope) };
      },
      async createViewer(scope, grant = true) {
        const userId = randomUUID();
        const memberId = randomUUID();
        await db.admin.query(
          `INSERT INTO users(id,email,password_hash,status,updated_at)
           VALUES($1,$2,'test-only','ACTIVE',clock_timestamp())`,
          [userId, `${userId}@issue309.test.invalid`],
        );
        await db.admin.query(
          `INSERT INTO organization_memberships
             (id,organization_id,user_id,role,status,updated_at)
           VALUES($1,$2,$3,'LOCATION_MANAGER','ACTIVE',clock_timestamp())`,
          [memberId, scope.orgId, userId],
        );
        if (grant) await db.admin.query(
          `INSERT INTO membership_location_access
             (organization_id,membership_id,location_id) VALUES($1,$2,$3)`,
          [scope.orgId, memberId, scope.locationId],
        );
        await db.admin.query(
          `INSERT INTO organization_subscriptions
             (organization_id,plan_code,status,dashboard_access_enabled,
              report_exports_enabled,basic_branding_enabled)
           VALUES($1,'TEST_ENTITLED','ACTIVE',TRUE,TRUE,TRUE)
           ON CONFLICT (organization_id) DO UPDATE
             SET dashboard_access_enabled=TRUE,status='ACTIVE'`,
          [scope.orgId],
        );
        return { userId, memberId, authorization: await db.createBearer({
          ...scope, userId, memberId,
        }) };
      },
      upload(sessionId, authorization, bytes) {
        const form = new FormData();
        form.append("operationId", randomUUID());
        form.append("image", new Blob([new Uint8Array(bytes)], {
          type: "image/jpeg",
        }), "checkin.jpg");
        return request("POST",
          `/v1/staff/check-in/sessions/${sessionId}/condition-photo-uploads`,
          authorization, form);
      },
      get(path, authorization) { return request("GET", path, authorization); },
      async close() {
        try { await app?.close(); }
        finally {
          client?.destroy();
          for (const [key, original] of oldEnv) {
            if (original === undefined) delete process.env[key];
            else process.env[key] = original;
          }
          await db.close();
        }
      },
    };
  } catch (error) {
    try { await app?.close(); }
    finally {
      client?.destroy();
      for (const [key, original] of oldEnv) {
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
      }
      await db.close();
    }
    throw error;
  }
}
