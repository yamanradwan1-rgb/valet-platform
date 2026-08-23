import { Pool } from "pg";

import { hashProvisioningPassword } from "../staff-provisioning/provisioning-password";
import {
  assertEmployeeE2eTarget,
  EMPLOYEE_E2E,
} from "./employee-e2e-config";
import { persistEmployeeE2eFixture } from "./employee-e2e-persistence";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  assertEmployeeE2eTarget(databaseUrl);

  const password = process.env.E2E_STAFF_PASSWORD;
  if (!password) throw new Error("E2E_STAFF_PASSWORD is required.");
  const passwordHash = await hashProvisioningPassword(password);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const current = await client.query<{ name: string }>(
        "SELECT current_database() AS name",
      );
      if (current.rows[0]?.name !== process.env.E2E_APPROVED_DATABASE) {
        throw new Error("Connected database does not match E2E approval.");
      }
      await persistEmployeeE2eFixture(client, passwordHash);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  process.stdout.write(
    `Employee E2E fixture ready: ${EMPLOYEE_E2E.organizationId} / ${EMPLOYEE_E2E.locationId}\n`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  process.stderr.write(`Employee E2E provisioning failed: ${message}\n`);
  process.exitCode = 1;
});
