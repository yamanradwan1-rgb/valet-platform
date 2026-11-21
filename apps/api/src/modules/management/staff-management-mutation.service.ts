import type {
  StaffLocationAccessCommand,
  StaffMembershipDetail,
  StaffRoleCommand,
  StaffStatusCommand,
} from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { MANAGEMENT_POSTGRES_POOL } from "./management-writer-database.module";
import type { ManagementCommandContext } from "./management-command-context";
import { appendStaffManagementAudit } from "./staff-management-audit";
import {
  authorizeStaffManagementPreflight,
  authorizeStaffTarget,
  type StaffManagementAuthority,
} from "./staff-management-authorization";
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
  constructor(
    @Inject(MANAGEMENT_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  role(
    context: ManagementCommandContext,
    organizationId: string,
    membershipId: string,
    command: StaffRoleCommand,
  ): Promise<StaffMembershipDetail> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeStaffManagementPreflight(
        transaction,
        context,
        {
          organizationId,
        },
      );
      await authorizeStaffTarget(transaction, actor, membershipId);
      const before = await loadStaffMembership(
        transaction,
        organizationId,
        membershipId,
      );
      const mutation = await setStaffRole(transaction, context, {
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
      return this.finish(transaction, actor, organizationId, membershipId);
    });
  }

  status(
    context: ManagementCommandContext,
    organizationId: string,
    membershipId: string,
    command: StaffStatusCommand,
    desiredStatus: "ACTIVE" | "INACTIVE",
  ): Promise<StaffMembershipDetail> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeStaffManagementPreflight(
        transaction,
        context,
        {
          organizationId,
        },
      );
      await authorizeStaffTarget(transaction, actor, membershipId);
      const before = await loadStaffMembership(
        transaction,
        organizationId,
        membershipId,
      );
      const mutation = await setStaffStatus(transaction, context, {
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
      return this.finish(transaction, actor, organizationId, membershipId);
    });
  }

  locationAccess(
    context: ManagementCommandContext,
    organizationId: string,
    membershipId: string,
    command: StaffLocationAccessCommand,
    granted: boolean,
  ): Promise<StaffMembershipDetail> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeStaffManagementPreflight(
        transaction,
        context,
        {
          organizationId,
        },
      );
      await authorizeStaffTarget(transaction, actor, membershipId);
      await loadStaffMembership(transaction, organizationId, membershipId);
      const mutation = await setStaffLocationAccess(transaction, context, {
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
      return this.finish(transaction, actor, organizationId, membershipId);
    });
  }

  private async finish(
    transaction: PostgresTransaction,
    authority: StaffManagementAuthority,
    organizationId: string,
    membershipId: string,
  ): Promise<StaffMembershipDetail> {
    if (authority.kind === "LOCATION_MANAGER") {
      await authorizeStaffTarget(transaction, authority, membershipId);
    }
    const current = await loadStaffMembership(
      transaction,
      organizationId,
      membershipId,
    );
    const detail = await staffMembershipDetail(transaction, current);
    return detail;
  }
}
