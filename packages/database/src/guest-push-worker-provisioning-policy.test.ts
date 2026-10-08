import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readGuestPushWorkerProvisioningConfiguration } from "../scripts/guest-push-worker-provisioning-policy.mjs";

const migrationUrl =
  "postgresql://valet_migration:migration-pass@db.example.test:5432/valet";
const apiUrl =
  "postgresql://valet_api_runtime:api-pass@db.example.test:5432/valet";
const workerUrl =
  "postgresql://valet_guest_push_worker:worker-pass@db.example.test:5432/valet";
const provisioner = readFileSync(
  new URL("../scripts/provision-guest-push-worker-role.mjs", import.meta.url),
  "utf8",
);

function configuration(overrides: Record<string, string> = {}) {
  return {
    DATABASE_URL: apiUrl,
    GUEST_PUSH_WORKER_DATABASE_URL: workerUrl,
    GUEST_PUSH_WORKER_ROLE: "valet_guest_push_worker",
    MIGRATION_DATABASE_URL: migrationUrl,
    NODE_ENV: "test",
    ...overrides,
  };
}

describe("Guest Push worker provisioning identity policy", () => {
  it("accepts a dedicated worker principal on the same PostgreSQL target", () => {
    const result = readGuestPushWorkerProvisioningConfiguration(configuration());
    expect(result.workerRole).toBe("valet_guest_push_worker");
    expect(result.workerIdentity).toMatchObject({
      database: "valet",
      host: "db.example.test",
      port: "5432",
      role: "valet_guest_push_worker",
    });
  });

  it("rejects worker role reuse of the ordinary API principal before provisioning", () => {
    expect(() => readGuestPushWorkerProvisioningConfiguration(configuration({
      GUEST_PUSH_WORKER_DATABASE_URL:
        "postgresql://valet_api_runtime:other-pass@db.example.test:5432/valet",
      GUEST_PUSH_WORKER_ROLE: "valet_api_runtime",
    }))).toThrow(/must differ from the ordinary API role/);
  });

  it("rejects a worker role that does not match the dedicated worker URL principal", () => {
    expect(() => readGuestPushWorkerProvisioningConfiguration(configuration({
      GUEST_PUSH_WORKER_ROLE: "different_worker",
    }))).toThrow(/must match the GUEST_PUSH_WORKER_DATABASE_URL principal/);
  });

  it.each([
    [
      "database",
      "postgresql://valet_guest_push_worker:worker-pass@db.example.test:5432/other",
    ],
    [
      "server",
      "postgresql://valet_guest_push_worker:worker-pass@other.example.test:5432/valet",
    ],
    [
      "port",
      "postgresql://valet_guest_push_worker:worker-pass@db.example.test:6432/valet",
    ],
  ])("rejects worker URL target mismatch: %s", (_label, value) => {
    expect(() => readGuestPushWorkerProvisioningConfiguration(configuration({
      GUEST_PUSH_WORKER_DATABASE_URL: value,
    }))).toThrow(/same database and server/);
  });

  it("requires a valid dedicated worker URL", () => {
    expect(() => readGuestPushWorkerProvisioningConfiguration(configuration({
      GUEST_PUSH_WORKER_DATABASE_URL: "https://not-postgres.example.test/valet",
    }))).toThrow(/PostgreSQL GUEST_PUSH_WORKER_DATABASE_URL/);
  });

  it("validates identity linkage before opening the migration client or granting privileges", () => {
    const policyCall = provisioner.indexOf(
      "readGuestPushWorkerProvisioningConfiguration(process.env)",
    );
    const clientCreation = provisioner.indexOf("new " + "Client(");
    const privilegeGrant = provisioner.indexOf("provisionGuestPushWorkerPrivileges(");
    expect(policyCall).toBeGreaterThan(-1);
    expect(clientCreation).toBeGreaterThan(policyCall);
    expect(privilegeGrant).toBeGreaterThan(clientCreation);
  });
});
