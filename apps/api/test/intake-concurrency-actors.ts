import { randomUUID } from "node:crypto";
import type {
  IntakeFixture,
  IntakeSessionCommandTestHarness,
} from "./intake-session-command-test-harness";

export async function addIntakeEmployee(
  harness: IntakeSessionCommandTestHarness,
  scope: IntakeFixture,
): Promise<string> {
  const userId = randomUUID();
  const membershipId = randomUUID();
  await harness.adminPool.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'fixture-only','ACTIVE',now())`,
    [userId, `${userId}@intake-concurrency.test`],
  );
  await harness.adminPool.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',now())`,
    [membershipId, scope.organizationId, userId],
  );
  await harness.adminPool.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [scope.organizationId, membershipId, scope.locationId],
  );
  return userId;
}
