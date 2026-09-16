import type {
  StaffLocationAccessCommand,
  StaffManagementRole,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { PostgresTransaction } from "../../common/database/postgres";
import { ManagementAccessDeniedError } from "./management-authorization";
import { throwStaffManagementResult } from "./staff-management-errors";

interface MutationResultRow extends Record<string, unknown> {
  readonly affected_count?: number;
  readonly changed: boolean;
  readonly result_code: string;
  readonly version: number;
}

interface PostgresError extends Error {
  readonly code?: string;
}

async function execute(
  transaction: PostgresTransaction,
  sql: string,
  parameters: unknown[],
): Promise<{
  readonly affectedCount: number | null;
  readonly changed: boolean;
  readonly version: number;
}> {
  try {
    const result = await transaction.query<MutationResultRow>(sql, parameters);
    const row = result.rows[0];
    if (result.rowCount !== 1 || row === undefined) {
      throw new Error("Staff management mutation returned no result.");
    }
    if (row.result_code !== "OK") throwStaffManagementResult(row.result_code);
    return {
      affectedCount: row.affected_count ?? null,
      changed: row.changed,
      version: row.version,
    };
  } catch (error) {
    const postgresError = error as PostgresError;
    if (postgresError.code === "42501") throw new ManagementAccessDeniedError();
    if (postgresError.code === "22023") throw new ApiTransportValidationError();
    throw error;
  }
}

export function setStaffRole(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly expectedVersion: number;
    readonly membershipId: string;
    readonly organizationId: string;
    readonly role: StaffManagementRole;
  },
) {
  return execute(
    transaction,
    `SELECT version, changed, result_code
     FROM staff_management_set_role($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::membership_role)`,
    [
      input.actorMembershipId,
      input.organizationId,
      input.membershipId,
      input.expectedVersion,
      input.role,
    ],
  );
}

export function setStaffStatus(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly expectedVersion: number;
    readonly membershipId: string;
    readonly organizationId: string;
    readonly status: "ACTIVE" | "INACTIVE";
  },
) {
  return execute(
    transaction,
    `SELECT version, changed, result_code
     FROM staff_management_set_status($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::membership_status)`,
    [
      input.actorMembershipId,
      input.organizationId,
      input.membershipId,
      input.expectedVersion,
      input.status,
    ],
  );
}

export function setStaffLocationAccess(
  transaction: PostgresTransaction,
  input: StaffLocationAccessCommand & {
    readonly actorMembershipId: string;
    readonly granted: boolean;
    readonly membershipId: string;
    readonly organizationId: string;
  },
) {
  return execute(
    transaction,
    `SELECT version, changed, result_code, affected_count
     FROM staff_management_set_location_access(
       $1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid[],$6::boolean
     )`,
    [
      input.actorMembershipId,
      input.organizationId,
      input.membershipId,
      input.expectedVersion,
      input.locationIds,
      input.granted,
    ],
  );
}
