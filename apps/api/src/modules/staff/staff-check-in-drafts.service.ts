import { Inject, Injectable } from "@nestjs/common";
import type { StaffCheckInDraftsResponse } from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import {
  authorizeCustodyActorForPersistedScope,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "./custody-staff-authorizer";

interface DraftRow {
  check_in_condition_completed_at: Date | null;
  color: string | null;
  created_at: Date;
  make: string | null;
  model: string | null;
  plate_country: string | null;
  plate_number_raw: string | null;
  session_id: string;
  temporary_descriptor: string | null;
}

@Injectable()
export class StaffCheckInDraftsService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  private async loadLocationOrganization(
    transaction: PostgresTransaction,
    locationId: string,
  ): Promise<string> {
    const result = await transaction.query<{ organization_id: string }>(
      `SELECT organization_id::text
       FROM locations
       WHERE id = $1`,
      [locationId],
    );
    const organizationId = result.rows[0]?.organization_id;
    if (organizationId === undefined) {
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }
    return organizationId;
  }

  async getDrafts(
    authenticatedUserId: string,
    locationId: string,
  ): Promise<StaffCheckInDraftsResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await requireActiveCustodyUser(client, authenticatedUserId);

      const organizationId = await this.loadLocationOrganization(
        client,
        locationId,
      );

      const actor = await authorizeCustodyActorForPersistedScope(client, {
        allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
        authenticatedUserId,
        resourceScope: {
          locationId,
          organizationId,
        },
      });

      const eligibility = await lockShiftOperationalEligibility(client, {
        locationId,
        membershipId: actor.membershipId,
      });
      if (eligibility === null) {
        throw new CustodyStaffAuthorizationError("LOCATION_ACCESS_DENIED");
      }

      const draftsResult = await client.query<DraftRow>(
        `SELECT
           session.id::text AS session_id,
           session.created_at,
           session.check_in_condition_completed_at,
           vehicle.make,
           vehicle.model,
           vehicle.color,
           vehicle.plate_country,
           vehicle.plate_number_raw,
           vehicle.temporary_descriptor
         FROM valet_sessions AS session
         INNER JOIN vehicles AS vehicle
           ON vehicle.organization_id = session.organization_id
          AND vehicle.id = session.vehicle_id
         WHERE session.organization_id = $1
           AND session.location_id = $2
           AND session.checked_in_by_membership_id = $3
           AND session.state = 'CHECKING_IN'
         ORDER BY session.created_at ASC, session.id ASC`,
        [organizationId, locationId, actor.membershipId],
      );

      await client.query("COMMIT");

      return {
        drafts: draftsResult.rows.map((row) => ({
          conditionCompletedAt: row.check_in_condition_completed_at
            ? row.check_in_condition_completed_at.toISOString()
            : null,
          createdAt: row.created_at.toISOString(),
          sessionId: row.session_id,
          vehicle: {
            color: row.color,
            make: row.make,
            model: row.model,
            plateCountry: row.plate_country,
            plateNumberRaw: row.plate_number_raw,
            temporaryDescriptor: row.temporary_descriptor,
          },
        })),
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve original error.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
