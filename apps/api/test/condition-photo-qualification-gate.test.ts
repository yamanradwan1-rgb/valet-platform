import "reflect-metadata";

import { describe, expect, it } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import { ConditionPhotoBackendService } from "../src/modules/vehicle-photos/condition-photo-backend.service";

const fields = [
  "NODE_ENV",
  "CONDITION_PHOTO_STORAGE_ENABLED",
  "CONDITION_PHOTO_PRIVATE_BUCKET",
  "CONDITION_PHOTO_BUCKET_ALIAS",
  "CONDITION_PHOTO_STORAGE_REGION",
  "CONDITION_PHOTO_STORAGE_ENDPOINT",
  "CONDITION_PHOTO_STORAGE_PROVIDER_APPROVED",
  "CONDITION_PHOTO_ALLOW_TEST_HTTP",
  "CONDITION_PHOTO_P3_QUALIFICATION_ENABLED",
] as const;

function withPhotoEnvironment(
  overrides: Record<string, string>,
  assertGate: (service: ConditionPhotoBackendService) => void,
) {
  const original = new Map(fields.map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, {
      NODE_ENV: "test",
      CONDITION_PHOTO_STORAGE_ENABLED: "true",
      CONDITION_PHOTO_PRIVATE_BUCKET: "issue215-private-test",
      CONDITION_PHOTO_BUCKET_ALIAS: "issue215_local",
      CONDITION_PHOTO_STORAGE_REGION: "us-east-1",
      CONDITION_PHOTO_STORAGE_ENDPOINT: "https://localhost.invalid/",
      CONDITION_PHOTO_STORAGE_PROVIDER_APPROVED: "true",
      CONDITION_PHOTO_P3_QUALIFICATION_ENABLED: "true",
      ...overrides,
    });
    const backend = new ConditionPhotoBackendService(
      {} as PostgresPool,
      {} as StaffSessionContextResolver,
    );
    assertGate(backend);
  } finally {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe("P3 qualification release gate for physical Native testing", () => {
  it("requires the explicit qualification flag even under NODE_ENV=test", () => {
    withPhotoEnvironment({
      CONDITION_PHOTO_P3_QUALIFICATION_ENABLED: "false",
    }, (backend) => {
      expect(backend.trustedQualificationStore()).toBeUndefined();
    });
  });

  it("accepts only the existing isolated test qualification mode", () => {
    withPhotoEnvironment({}, (backend) => {
      expect(backend.trustedQualificationStore()).toMatchObject({
        bucketAlias: "issue215_local",
      });
    });
  });

  it("documents that even HTTPS and provider-approved dev Native cannot qualify", () => {
    withPhotoEnvironment({ NODE_ENV: "development" }, (backend) => {
      expect(backend.trustedQualificationStore()).toBeUndefined();
    });
  });

  it("does not grant production qualification from its current flags", () => {
    withPhotoEnvironment({ NODE_ENV: "production" }, (backend) => {
      expect(backend.trustedQualificationStore()).toBeUndefined();
    });
  });
});
