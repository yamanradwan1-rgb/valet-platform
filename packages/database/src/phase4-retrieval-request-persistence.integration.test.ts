import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";
import {
  createTaskDispatchScope,
  type TaskDispatchScope,
} from "./task-dispatch-fixture.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_006b_requester_${process.pid}_${Date.now()}`;
const migrationsPath = fileURLToPath(
  new URL("../prisma/migrations", import.meta.url),
);
let client: Client;

async function insertRequest(
  scope: TaskDispatchScope,
  input: {
    customerId?: string | null;
    membershipId?: string | null;
    status?: "ACCEPTED" | "CANCELLED" | "COMPLETED" | "OPEN";
    type: "CUSTOMER" | "STAFF";
  },
) {
  return client.query(
    `INSERT INTO retrieval_requests
       (id, organization_id, valet_session_id, requested_by_type,
        requested_by_customer_id, requested_by_membership_id, status,
        requested_at)
     VALUES ($1, $2, $3, $4::retrieval_requester_type, $5, $6,
             $7::retrieval_request_status, transaction_timestamp())`,
    [
      randomUUID(),
      scope.organizationId,
      scope.valetSessionId,
      input.type,
      input.customerId ?? null,
      input.membershipId ?? null,
      input.status ?? "OPEN",
    ],
  );
}

async function addCustomer(scope: TaskDispatchScope): Promise<string> {
  const customerId = randomUUID();
  await client.query(
    `INSERT INTO customers
       (id, organization_id, phone_normalized, updated_at)
     VALUES ($1, $2, $3, transaction_timestamp())`,
    [customerId, scope.organizationId, `+96279${randomUUID().slice(0, 7)}`],
  );
  return customerId;
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();

  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  client = new Client({ connectionString: url.toString() });
  await client.connect();
  for (const migration of expectedMigrationDirectories) {
    await client.query(
      await readFile(join(migrationsPath, migration, "migration.sql"), "utf8"),
    );
  }
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("VAL-006B retrieval requester persistence", () => {
  it("accepts CUSTOMER origin without a persisted Customer row", async () => {
    const scope = await createTaskDispatchScope(client);
    await expect(insertRequest(scope, { type: "CUSTOMER" })).resolves.toMatchObject({
      rowCount: 1,
    });
  });

  it("keeps optional same-Organization Customer attribution valid", async () => {
    const scope = await createTaskDispatchScope(client);
    const customerId = await addCustomer(scope);
    await expect(
      insertRequest(scope, { customerId, type: "CUSTOMER" }),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it("rejects membership attribution on CUSTOMER origin", async () => {
    const scope = await createTaskDispatchScope(client);
    await expect(
      insertRequest(scope, {
        membershipId: scope.membershipId,
        type: "CUSTOMER",
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("preserves STAFF membership-only requester semantics", async () => {
    const valid = await createTaskDispatchScope(client);
    await expect(
      insertRequest(valid, {
        membershipId: valid.membershipId,
        type: "STAFF",
      }),
    ).resolves.toMatchObject({ rowCount: 1 });

    const missingMembership = await createTaskDispatchScope(client);
    await expect(
      insertRequest(missingMembership, { type: "STAFF" }),
    ).rejects.toMatchObject({ code: "23514" });

    const withCustomer = await createTaskDispatchScope(client);
    const customerId = await addCustomer(withCustomer);
    await expect(
      insertRequest(withCustomer, {
        customerId,
        membershipId: withCustomer.membershipId,
        type: "STAFF",
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps same-tenant attribution and one-active-request guards", async () => {
    const scope = await createTaskDispatchScope(client);
    const other = await createTaskDispatchScope(client);
    const otherCustomerId = await addCustomer(other);
    await expect(
      insertRequest(scope, { customerId: otherCustomerId, type: "CUSTOMER" }),
    ).rejects.toMatchObject({ code: "23503" });

    await insertRequest(scope, { type: "CUSTOMER" });
    await expect(
      insertRequest(scope, { type: "CUSTOMER" }),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "retrieval_requests_one_active_per_valet_session_idx",
    });
  });
});
