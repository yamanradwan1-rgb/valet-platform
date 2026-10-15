import "reflect-metadata";

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { S3Client } from "@aws-sdk/client-s3";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import sharp from "sharp";

import { CheckInModule } from "../src/modules/check-in-api/check-in.module";
import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";
import {
  assertRecoveryMinioDocker, pinnedRecoveryMinioImageId,
} from "./issue215-recovery-minio-target";
import {
  openIssue215HttpDatabase,
  type Issue215HttpDatabase,
  type Issue215HttpScope,
} from "./issue215-http-fixture-database";

const ownedBucket = "issue215-s3-worker4";
const ownedProject = "issue215-s3-worker4";
const envKeys = [
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "DATABASE_URL",
  "CONDITION_PHOTO_STORAGE_ENABLED", "CONDITION_PHOTO_PRIVATE_BUCKET",
  "CONDITION_PHOTO_BUCKET_ALIAS", "CONDITION_PHOTO_STORAGE_REGION",
  "CONDITION_PHOTO_STORAGE_ENDPOINT", "CONDITION_PHOTO_ALLOW_TEST_HTTP",
  "CONDITION_PHOTO_P3_QUALIFICATION_ENABLED", "ANTI_ABUSE_HMAC_SECRET_B64URL",
] as const;

export interface S3Fixture {
  readonly endpoint: string;
  readonly bucket: string;
  readonly region: string;
  readonly containerProject: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly versioning: boolean;
  readonly temporary: boolean;
}

export interface Issue215HttpFixture {
  readonly db: Issue215HttpDatabase;
  readonly baseUrl: string;
  readonly privateStore: S3PrivatePhotoStore;
  readonly bucket: string;
  seed(required?: boolean, override?: boolean | null): Promise<{
    scope: Issue215HttpScope;
    authorization: string;
  }>;
  request(
    method: "GET" | "POST",
    sessionId: string,
    authorization: string,
    endpoint: string,
    body?: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  upload(
    sessionId: string,
    authorization: string,
    operationId: string,
    image: Buffer,
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  close(): Promise<void>;
}

export async function syntheticJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 32, height: 24, channels: 3, background: "#418bc2" },
  }).jpeg().withExif({ IFD0: { Copyright: "issue215-private-exif-canary" } }).toBuffer();
}

export function sha256(bytes: Buffer): Buffer {
  return createHash("sha256").update(bytes).digest();
}

export function readAttestedIssue215Minio(): S3Fixture {
  if (process.env.ISSUE215_REAL_HTTP_ENABLED !== "true" ||
      process.env.NODE_ENV !== "test")
    throw new Error("Explicit Issue 215 local HTTP qualification gate required.");
  const fixturePath = resolve(__dirname, "../../../scripts/issue215-local-s3/.runtime.json");
  const s3 = JSON.parse(readFileSync(fixturePath, "utf8")) as S3Fixture;
  if (!s3.temporary || !s3.versioning || s3.bucket !== ownedBucket ||
      s3.containerProject !== ownedProject ||
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(s3.endpoint) ||
      !/^issue215app[a-f0-9]{10}$/.test(s3.accessKeyId) ||
      !/^[a-f0-9]{56}$/.test(s3.secretAccessKey))
    throw new Error("The task-owned private versioned S3 fixture is not attested.");

  // The fixture file is only a claim: prove its port, image, temporary volume
  // and ownership against Docker before provisioning a disposable test DB.
  try {
    const ids = execFileSync("docker", [
      "ps", "-q", "--filter", `label=com.docker.compose.project=${ownedProject}`,
    ], { encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: "pipe" })
      .trim().split(/\s+/).filter(Boolean);
    if (ids.length !== 1) throw new Error("Unexpected MinIO identity.");
    const inspected: unknown = JSON.parse(execFileSync("docker", [
      "inspect", ids[0]!,
    ], { encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: "pipe" }));
    assertRecoveryMinioDocker(inspected, {
      ...s3, imageId: pinnedRecoveryMinioImageId(),
    });
  } catch {
    throw new Error("The live task-owned private MinIO container is not attested.");
  }
  return s3;
}

export async function openIssue215HttpFixture(): Promise<Issue215HttpFixture> {
  const s3 = readAttestedIssue215Minio();
  const db = await openIssue215HttpDatabase();
  const oldEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  let app: INestApplication | undefined;
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
      ANTI_ABUSE_HMAC_SECRET_B64URL: createHash("sha256")
        .update(`issue215-local-${s3.accessKeyId}`).digest("base64url"),
    });
    // Real AuthModule/CheckInModule/ConditionPhotoBackendService; no mocked
    // principal, no fake storage adapter, and no overridden runtime pool.
    @Module({ imports: [CheckInModule] })
    class Issue215HttpTestApp {}
    app = await NestFactory.create(Issue215HttpTestApp, { logger: false });
    await app.listen(0, "127.0.0.1");
    const url = await app.getUrl();

    const client = new S3Client({
      endpoint: s3.endpoint, region: s3.region, forcePathStyle: true,
      maxAttempts: 1,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    });
    const privateStore = new S3PrivatePhotoStore({
      endpoint: s3.endpoint, region: s3.region, bucket: s3.bucket,
      bucketAlias: "issue215_local", allowTestHttp: true,
    }, client);
    return {
      db, baseUrl: url, privateStore, bucket: s3.bucket,
      async seed(required = true, override = null) {
        const scope = await db.seed(required, override);
        return { scope, authorization: await db.createBearer(scope) };
      },
      async request(method, sessionId, authorization, endpoint, body) {
        const response = await fetch(`${url}/v1/staff/check-in/sessions/${sessionId}/${endpoint}`, {
          method,
          headers: {
            authorization,
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: await response.json() as Record<string, unknown> };
      },
      async upload(sessionId, authorization, operationId, image) {
        const form = new FormData();
        form.append("operationId", operationId);
        form.append("image", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "condition.jpg");
        const response = await fetch(`${url}/v1/staff/check-in/sessions/${sessionId}/condition-photo-uploads`, {
          method: "POST", headers: { authorization }, body: form,
        });
        return { status: response.status, body: await response.json() as Record<string, unknown> };
      },
      close: async () => {
        try { await app?.close(); }
        finally {
          client.destroy();
          for (const [key, value] of oldEnv) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
          await db.close();
        }
      },
    };
  } catch (error) {
    try { await app?.close(); } finally {
      for (const [key, value] of oldEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await db.close();
    }
    throw error;
  }
}
