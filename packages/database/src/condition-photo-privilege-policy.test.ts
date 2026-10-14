import { describe, expect, it } from "vitest";

import {
  photoMaintenanceFunctions,
  photoPrivateTables,
  photoRuntimeFunctions,
} from "../scripts/condition-photo-privilege-policy.mjs";
import { readConditionPhotoMaintenancePolicy } from "../scripts/condition-photo-maintenance-policy.mjs";
import { provisionConditionPhotoRuntimePrivileges } from "../scripts/condition-photo-runtime-privileges.mjs";
import { provisionConditionPhotoMaintenancePrivileges } from "../scripts/condition-photo-maintenance-privileges.mjs";

const migrationUrl = "postgresql://valet_migration:mig@db.example.test:5432/valet";
const runtimeUrl = "postgresql://valet_runtime:api@db.example.test:5432/valet";
const maintenanceUrl = "postgresql://valet_photo_maintenance:maint@db.example.test:5432/valet";

const identity = {
  NODE_ENV: "test",
  MIGRATION_DATABASE_URL: migrationUrl,
  DATABASE_URL: runtimeUrl,
  CONDITION_PHOTO_MAINTENANCE_DATABASE_URL: maintenanceUrl,
  CONDITION_PHOTO_MAINTENANCE_ROLE: "valet_photo_maintenance",
};

describe("Issue #215 photo maintenance database identity", () => {
  it("requires a separate principal on the exact same database target", () => {
    expect(readConditionPhotoMaintenancePolicy(identity).maintenanceRole)
      .toBe("valet_photo_maintenance");
    for (const overrides of [
      { CONDITION_PHOTO_MAINTENANCE_ROLE: "valet_runtime" },
      { CONDITION_PHOTO_MAINTENANCE_ROLE: "valet_migration" },
      { CONDITION_PHOTO_MAINTENANCE_ROLE: "invalid;role" },
      { CONDITION_PHOTO_MAINTENANCE_ROLE: "another_role" },
      { CONDITION_PHOTO_MAINTENANCE_DATABASE_URL: maintenanceUrl.replace("/valet", "/other") },
      { CONDITION_PHOTO_MAINTENANCE_DATABASE_URL: maintenanceUrl.replace("db.example.test", "other.example.test") },
    ]) {
      expect(() => readConditionPhotoMaintenancePolicy({ ...identity, ...overrides }))
        .toThrow();
    }
  });
});

interface Statement { format: string; values: string[] }

function roleProvisionHarness() {
  const signatures = [
    ...photoRuntimeFunctions,
    ...photoMaintenanceFunctions,
    "public.condition_photo_coherence_guard()",
  ];
  const statements: Statement[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM pg_proc function")) {
        return {
          rows: signatures.map((signature, index) => ({
            signature,
            oid: `${index + 100}`,
          })),
        };
      }
      if (sql.includes("FROM unnest($1::text[])")) {
        return {
          rows: (params?.[0] as string[]).map((signature) => ({
            signature,
            oid: `${signatures.indexOf(signature) + 100}`,
          })),
        };
      }
      if (sql.includes("pg_attribute")) {
        return { rows: [{ names: "id,status", columns: "id,status" }] };
      }
      if (sql === "REVOKE ALL ON TABLE public.vehicle_photos FROM PUBLIC") {
        return { rows: [] };
      }
      throw new Error(`Unexpected database query: ${sql}`);
    },
  };
  const executeFormatted = async (
    _client: unknown,
    format: string,
    values: string[],
  ) => { statements.push({ format, values }); };
  return { client, executeFormatted, statements };
}

function grantTargets(statements: Statement[]) {
  return statements
    .filter(({ format }) => format.startsWith("GRANT EXECUTE ON FUNCTION"))
    .map(({ values }) => values[0]);
}

describe("Issue #215 photo function grant boundaries", () => {
  it("reconciles every public helper grant while restricting API to photo entrypoints", async () => {
    const harness = roleProvisionHarness();
    await provisionConditionPhotoRuntimePrivileges(
      harness.client, harness.executeFormatted, "valet_runtime",
    );
    expect(grantTargets(harness.statements)).toEqual(photoRuntimeFunctions);
    expect(grantTargets(harness.statements)).toContain(
      "public.condition_photo_mark_stored(uuid,uuid,uuid,uuid,uuid,text,bytea,integer,integer,integer)",
    );
    expect(grantTargets(harness.statements)).toContain(
      "public.condition_photo_record_failure(uuid,uuid,uuid,uuid,uuid,text)",
    );
    for (const signature of [...photoMaintenanceFunctions, "public.condition_photo_coherence_guard()"] ) {
      expect(harness.statements).toContainEqual({
        format: "REVOKE ALL ON FUNCTION %s FROM PUBLIC",
        values: [signature],
      });
      expect(harness.statements).toContainEqual({
        format: "REVOKE ALL ON FUNCTION %s FROM %I",
        values: [signature, "valet_runtime"],
      });
    }
    for (const table of photoPrivateTables) {
      expect(harness.statements).toContainEqual({
        format: "REVOKE ALL ON TABLE %s FROM PUBLIC",
        values: [table],
      });
    }
    expect(harness.statements.some(({ format }) => format.includes("FROM PUBLIC")))
      .toBe(true);
  });

  it("maintenance has only expiry/abandon functions and no direct table writes", async () => {
    const harness = roleProvisionHarness();
    await provisionConditionPhotoMaintenancePrivileges(
      harness.client, harness.executeFormatted, "valet_photo_maintenance",
    );
    expect(grantTargets(harness.statements)).toEqual(photoMaintenanceFunctions);
    for (const signature of photoRuntimeFunctions) {
      expect(harness.statements).toContainEqual({
        format: "REVOKE ALL ON FUNCTION %s FROM %I",
        values: [signature, "valet_photo_maintenance"],
      });
    }
    expect(harness.statements).toContainEqual({
      format: "REVOKE ALL ON TABLE %s FROM %I",
      values: ["public.vehicle_photos", "valet_photo_maintenance"],
    });
  });
});
