import type { PostgresTransaction } from "../../common/database/postgres";
import { ShiftOperationError } from "./shift-errors";

export type OperationalShiftRole = "VALET_EMPLOYEE" | "VALET_SUPERVISOR";

export interface AuthorizedShiftStartScope {
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
}

export async function requireActiveShiftUser(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
): Promise<void> {
  const result = await transaction.query<{ status: string }>(
    `SELECT status::text
     FROM users
     WHERE id = $1
     FOR SHARE`,
    [authenticatedUserId],
  );
  if (result.rows[0]?.status !== "ACTIVE") {
    throw new ShiftOperationError("AUTHORIZATION_DENIED");
  }
}

export async function authorizeShiftStart(
  transaction: PostgresTransaction,
  input: {
    readonly authenticatedUserId: string;
    readonly targetLocationId: string;
  },
): Promise<AuthorizedShiftStartScope> {
  await requireActiveShiftUser(transaction, input.authenticatedUserId);
  const locationResult = await transaction.query<{
    location_status: string;
    organization_id: string;
    organization_status: string;
  }>(
    `SELECT location.organization_id::text,
            location.status::text AS location_status,
            organization.status::text AS organization_status
     FROM locations AS location
     INNER JOIN organizations AS organization
       ON organization.id = location.organization_id
     WHERE location.id = $1
     FOR SHARE OF location, organization`,
    [input.targetLocationId],
  );
  const location = locationResult.rows[0];
  if (location === undefined) {
    throw new ShiftOperationError("TENANT_ACCESS_DENIED");
  }
  if (
    location.location_status !== "ACTIVE" ||
    location.organization_status !== "ACTIVE"
  ) {
    throw new ShiftOperationError("AUTHORIZATION_DENIED");
  }

  const membershipResult = await transaction.query<{
    id: string;
    role: string;
    status: string;
  }>(
    `SELECT id::text, role::text, status::text
     FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2
     FOR UPDATE`,
    [location.organization_id, input.authenticatedUserId],
  );
  const membership = membershipResult.rows[0];
  if (membership === undefined || membership.status !== "ACTIVE") {
    throw new ShiftOperationError("TENANT_ACCESS_DENIED");
  }

  const access = await transaction.query<{ allowed: boolean }>(
    `SELECT true AS allowed
     FROM membership_location_access
     WHERE organization_id = $1
       AND membership_id = $2
       AND location_id = $3
     FOR SHARE`,
    [location.organization_id, membership.id, input.targetLocationId],
  );
  if (access.rows[0]?.allowed !== true) {
    throw new ShiftOperationError("LOCATION_ACCESS_DENIED");
  }
  if (!isOperationalShiftRole(membership.role)) {
    throw new ShiftOperationError("AUTHORIZATION_DENIED");
  }

  return {
    locationId: input.targetLocationId,
    membershipId: membership.id,
    organizationId: location.organization_id,
  };
}

export function isOperationalShiftRole(
  role: string,
): role is OperationalShiftRole {
  return role === "VALET_EMPLOYEE" || role === "VALET_SUPERVISOR";
}
