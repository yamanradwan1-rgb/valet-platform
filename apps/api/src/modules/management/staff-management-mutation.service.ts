import type {
  StaffLocationAccessCommand,
  StaffMembershipDetail,
  StaffRoleCommand,
  StaffStatusCommand,
} from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "./management-authorization";
import { appendStaffManagementAudit } from "./staff-management-audit";
import {
  setStaffLocationAccess,
  setStaffRole,
  setStaffStatus,
} from "./staff-management-mutation-repository";
import {
  loadStaffMembership,
  staffMembershipDetail,
} from "./staff-management-projection";

@Injectable()
export class StaffManagementMutationService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  role(
    context: StaffSessionContext,
    organizationId: string,
    membershipId: string,
    command: StaffRoleCommand,
  ): Promise<StaffMembershipDetail> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeCompanyAdminManagement(transaction, context, {
        assurance: "SENSITIVE",
        capability: "STAFF_MANAGE_ELIGIBLE",
        organizationId,
      });
      const before = await loadStaffMembership(
        transaction,
        organizationId,
        membershipId,
        true,
      );
      const mutation = await setStaffRole(transaction, {
        actorMembershipId: actor.membershipId,
        expectedVersion: command.expectedVersion,
        membershipId,
        organizationId,
        role: command.role,
      });
      if (mutation.changed) {
        await appendStaffManagementAudit(transaction, {
          actorMembershipId: actor.membershipId,
          eventType: "STAFF_ROLE_CHANGED",
          membershipId,
          metadata: {
            membershipVersion: mutation.version,
            newRole: command.role,
            previousRole: before.role,
          },
          organizationId,
        });
      }
      return this.finish(transaction, context, organizationId, membershipId);
    });
  }

  status(
    context: StaffSessionContext,
    organizationId: string,
    membershipId: string,
    command: StaffStatusCommand,
    desiredStatus: "ACTIVE" | "INACTIVE",
  ): Promise<StaffMembershipDetail> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeCompanyAdminManagement(transaction, context, {
        assurance: "SENSITIVE",
        capability: "STAFF_MANAGE_ELIGIBLE",
        organizationId,
      });
      const before = await loadStaffMembership(
        transaction,
        organizationId,
        membershipId,
        true,
      );
      const mutation = await setStaffStatus(transaction, {
        actorMembershipId: actor.membershipId,
        expectedVersion: command.expectedVersion,
        membershipId,
        organizationId,
        status: desiredStatus,
      });
      if (mutation.changed) {
        await appendStaffManagementAudit(transaction, {
          actorMembershipId: actor.membershipId,
          eventType:
            desiredStatus === "ACTIVE"
              ? "STAFF_MEMBERSHIP_ACTIVATED"
              : "STAFF_MEMBERSHIP_DEACTIVATED",
          membershipId,
          metadata: {
            membershipVersion: mutation.version,
            newStatus: desiredStatus,
            previousStatus: before.status,
          },
          organizationId,
        });
      }
      return this.finish(transaction, context, organizationId, membershipId);
    });
  }

  locationAccess(
    context: StaffSessionContext,
    organizationId: string,
    membershipId: string,
    command: StaffLocationAccessCommand,
    granted: boolean,
  ): Promise<StaffMembershipDetail> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeCompanyAdminManagement(transaction, context, {
        assurance: "SENSITIVE",
        capability: "STAFF_MANAGE_ELIGIBLE",
        organizationId,
      });
      await loadStaffMembership(transaction, organizationId, membershipId, true);
      const mutation = await setStaffLocationAccess(transaction, {
        ...command,
        actorMembershipId: actor.membershipId,
        granted,
        membershipId,
        organizationId,
      });
      if (mutation.changed) {
        await appendStaffManagementAudit(transaction, {
          actorMembershipId: actor.membershipId,
          eventType: granted
            ? "STAFF_LOCATION_ACCESS_GRANTED"
            : "STAFF_LOCATION_ACCESS_REVOKED",
          membershipId,
          metadata: {
            locationCount: mutation.affectedCount ?? command.locationIds.length,
            membershipVersion: mutation.version,
          },
          organizationId,
        });
      }
      return this.finish(transaction, context, organizationId, membershipId);
    });
  }

  private async finish(
    transaction: Parameters<typeof recordAdminActivityInTransaction>[0],
    context: StaffSessionContext,
    organizationId: string,
    membershipId: string,
  ): Promise<StaffMembershipDetail> {
    const current = await loadStaffMembership(transaction, organizationId, membershipId);
    const detail = await staffMembershipDetail(transaction, current);
    await recordAdminActivityInTransaction(transaction, context);
    return detail;
  }
}
