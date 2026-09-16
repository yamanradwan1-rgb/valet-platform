import type { ManagementCapability } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { isCompanyAdminManagementCapability } from "./management-capabilities";

export type ManagementAssuranceRequirement = "SENSITIVE" | "STANDARD";

export interface ManagementAuthorityScope {
  readonly locationId: string | null;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly staffAuthSessionId: string;
  readonly userId: string;
}

export class ManagementAccessDeniedError extends Error {
  readonly code = "AUTHORIZATION_DENIED";

  constructor() {
    super("The requested resource is not available.");
    this.name = "ManagementAccessDeniedError";
  }
}

interface MembershipScopeRow {
  readonly membershipId: string;
  readonly organizationId: string;
}

export async function hasEligibleCompanyAdminMembership(
  transaction: PostgresTransaction,
  userId: string,
): Promise<boolean> {
  const result = await transaction.query(
    `SELECT 1
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
     WHERE membership.user_id = $1
       AND membership.status = 'ACTIVE'
       AND membership.role = 'ORG_ADMIN'
       AND organization.status = 'ACTIVE'
     LIMIT 1`,
    [userId],
  );
  return result.rowCount === 1;
}

export async function eligibleCompanyAdminLocationOrganization(
  transaction: PostgresTransaction,
  userId: string,
  locationId: string,
  requireActiveLocation = true,
): Promise<string | null> {
  const result = await transaction.query<{ readonly organizationId: string }>(
    `SELECT organization.id::text AS "organizationId"
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $2
      ${requireActiveLocation ? "AND location.status = 'ACTIVE'" : ""}
     WHERE membership.user_id = $1
       AND membership.status = 'ACTIVE'
       AND membership.role = 'ORG_ADMIN'
     LIMIT 1`,
    [userId, locationId],
  );
  return result.rows[0]?.organizationId ?? null;
}

export async function authorizeCompanyAdminManagement(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  input: {
    readonly assurance?: ManagementAssuranceRequirement;
    readonly capability: ManagementCapability;
    readonly organizationId: string;
    readonly requireActiveLocation?: boolean;
    readonly targetLocationId?: string;
  },
): Promise<ManagementAuthorityScope> {
  if (!isCompanyAdminManagementCapability(input.capability)) {
    throw new ManagementAccessDeniedError();
  }
  const eligible = await transaction.query(
    `SELECT 1
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
     WHERE membership.user_id = $1
       AND membership.organization_id = $2
       AND membership.status = 'ACTIVE'
       AND membership.role = 'ORG_ADMIN'
       AND organization.status = 'ACTIVE'`,
    [context.userId, input.organizationId],
  );
  if (eligible.rowCount !== 1) throw new ManagementAccessDeniedError();
  await requireMfaAssuranceInTransaction(transaction, context, {
    sensitive: input.assurance === "SENSITIVE",
  });
  await transaction.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-management-org:' || $1::text, 0)
     )`,
    [input.organizationId],
  );
  const organization = await transaction.query(
    `SELECT id FROM organizations
     WHERE id = $1 AND status = 'ACTIVE'`,
    [input.organizationId],
  );
  if (organization.rowCount !== 1) throw new ManagementAccessDeniedError();
  const membership = await transaction.query<MembershipScopeRow>(
    `SELECT membership.id::text AS "membershipId",
            membership.organization_id::text AS "organizationId"
     FROM organization_memberships AS membership
     WHERE membership.user_id = $1
       AND membership.organization_id = $2
       AND membership.status = 'ACTIVE'
       AND membership.role = 'ORG_ADMIN'
     FOR UPDATE OF membership`,
    [context.userId, input.organizationId],
  );
  const row = membership.rows[0];
  if (membership.rowCount !== 1 || row === undefined) {
    throw new ManagementAccessDeniedError();
  }
  let locationId: string | null = null;
  if (input.targetLocationId !== undefined) {
    const location = await transaction.query<{ readonly locationId: string }>(
      `SELECT location.id::text AS "locationId"
       FROM locations AS location
       WHERE location.id = $1
         AND location.organization_id = $2
         ${input.requireActiveLocation === true ? "AND location.status = 'ACTIVE'" : ""}
       FOR UPDATE`,
      [input.targetLocationId, row.organizationId],
    );
    locationId = location.rows[0]?.locationId ?? null;
    if (location.rowCount !== 1 || locationId === null) {
      throw new ManagementAccessDeniedError();
    }
  }
  return {
    locationId,
    membershipId: row.membershipId,
    organizationId: row.organizationId,
    staffAuthSessionId: context.staffAuthSessionId,
    userId: context.userId,
  };
}
