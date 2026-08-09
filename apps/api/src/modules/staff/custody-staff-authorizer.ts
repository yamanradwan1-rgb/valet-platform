import type { PostgresTransaction } from "../../common/database/postgres";

export const membershipRoles = [
  "ORG_ADMIN",
  "LOCATION_MANAGER",
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
] as const;

export type MembershipRole = (typeof membershipRoles)[number];

export type CustodyStaffAuthorizationErrorCode =
  "TENANT_ACCESS_DENIED" | "LOCATION_ACCESS_DENIED" | "AUTHORIZATION_DENIED";

const errorMessages: Record<CustodyStaffAuthorizationErrorCode, string> = {
  TENANT_ACCESS_DENIED: "The requested custody resource is not available.",
  LOCATION_ACCESS_DENIED: "The actor is not authorized for this location.",
  AUTHORIZATION_DENIED: "The actor is not authorized for this operation.",
};

export class CustodyStaffAuthorizationError extends Error {
  readonly code: CustodyStaffAuthorizationErrorCode;

  constructor(code: CustodyStaffAuthorizationErrorCode) {
    super(errorMessages[code]);
    this.name = "CustodyStaffAuthorizationError";
    this.code = code;
  }
}

export interface AuthorizedCustodyActor {
  readonly membershipId: string;
  readonly role: MembershipRole;
  readonly userId: string;
}

export interface PersistedCustodyResourceScope {
  readonly locationId: string;
  readonly organizationId: string;
}

interface MembershipRow {
  id: string;
  role: MembershipRole;
  status: string;
}

export async function requireActiveCustodyUser(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
): Promise<void> {
  const userResult = await transaction.query<{ status: string }>(
    `SELECT status::text
     FROM users
     WHERE id = $1
     FOR SHARE`,
    [authenticatedUserId],
  );
  if (userResult.rows[0]?.status !== "ACTIVE") {
    throw new CustodyStaffAuthorizationError("AUTHORIZATION_DENIED");
  }
}

export async function authorizeCustodyActorForPersistedScope(
  transaction: PostgresTransaction,
  input: {
    readonly allowedRoles: readonly MembershipRole[];
    readonly authenticatedUserId: string;
    readonly resourceScope: PersistedCustodyResourceScope;
  },
): Promise<AuthorizedCustodyActor> {
  const membershipResult = await transaction.query<MembershipRow>(
    `SELECT id::text, role::text, status::text
     FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2
     FOR SHARE`,
    [input.resourceScope.organizationId, input.authenticatedUserId],
  );
  const membership = membershipResult.rows[0];
  if (membership === undefined || membership.status !== "ACTIVE") {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }

  const tenantResult = await transaction.query<{
    location_status: string;
    organization_status: string;
  }>(
    `SELECT organization.status::text AS organization_status,
            location.status::text AS location_status
     FROM organizations AS organization
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $2
     WHERE organization.id = $1
     FOR SHARE OF organization, location`,
    [input.resourceScope.organizationId, input.resourceScope.locationId],
  );
  const tenant = tenantResult.rows[0];
  if (tenant === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  if (
    tenant.organization_status !== "ACTIVE" ||
    tenant.location_status !== "ACTIVE"
  ) {
    throw new CustodyStaffAuthorizationError("AUTHORIZATION_DENIED");
  }

  const accessResult = await transaction.query<{ allowed: boolean }>(
    `SELECT true AS allowed
     FROM membership_location_access
     WHERE organization_id = $1
       AND membership_id = $2
       AND location_id = $3
     FOR SHARE`,
    [
      input.resourceScope.organizationId,
      membership.id,
      input.resourceScope.locationId,
    ],
  );
  if (accessResult.rows[0]?.allowed !== true) {
    throw new CustodyStaffAuthorizationError("LOCATION_ACCESS_DENIED");
  }

  if (!input.allowedRoles.includes(membership.role)) {
    throw new CustodyStaffAuthorizationError("AUTHORIZATION_DENIED");
  }

  return {
    membershipId: membership.id,
    role: membership.role,
    userId: input.authenticatedUserId,
  };
}
