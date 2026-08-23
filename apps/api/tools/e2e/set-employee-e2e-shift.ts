import { Pool } from "pg";

import {
  assertEmployeeE2eTarget,
  EMPLOYEE_E2E,
} from "./employee-e2e-config";

async function main(): Promise<void> {
  const state = process.argv[2];
  if (state !== "active" && state !== "ended") {
    throw new Error("Expected shift state: active or ended.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  assertEmployeeE2eTarget(databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query(
      state === "active"
        ? `UPDATE shifts SET status = 'ACTIVE', ended_at = NULL,
             started_at = now() - interval '1 hour'
           WHERE id = $1 AND organization_id = $2 AND membership_id = $3`
        : `UPDATE shifts SET status = 'ENDED', ended_at = now()
           WHERE id = $1 AND organization_id = $2 AND membership_id = $3`,
      [EMPLOYEE_E2E.shiftId, EMPLOYEE_E2E.organizationId,
        EMPLOYEE_E2E.membershipId],
    );
    if (result.rowCount !== 1) {
      throw new Error("Deterministic Employee E2E shift was not found.");
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  process.stderr.write(`Employee E2E shift update failed: ${message}\n`);
  process.exitCode = 1;
});
