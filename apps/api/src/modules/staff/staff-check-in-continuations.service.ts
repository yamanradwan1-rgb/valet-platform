import { Inject, Injectable } from "@nestjs/common";
import { type StaffCheckInContinuationsResponse } from "@valet/contracts";

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

interface SessionContinuationRow {
  readonly color: string | null;
  readonly created_at: Date;
  readonly make: string | null;
  readonly model: string | null;
  readonly plate_country: string | null;
  readonly plate_number_raw: string | null;
  readonly session_id: string;
  readonly temporary_descriptor: string | null;
}

@Injectable()
export class StaffCheckInContinuationsService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL)
    private readonly pool: PostgresPool,
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

  async getContinuations(
    authenticatedUserId: string,
    locationId: string,
  ): Promise<StaffCheckInContinuationsResponse> {
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

      const rowsResult = await client.query<SessionContinuationRow>(
        `SELECT
           session.id::text AS session_id,
           session.created_at,
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
           AND session.state = 'AWAITING_PARKING'
           AND NOT EXISTS (
             SELECT 1
             FROM tasks AS task
             WHERE task.organization_id = session.organization_id
               AND task.location_id = session.location_id
               AND task.valet_session_id = session.id
               AND task.task_type = 'PARKING'
               AND task.status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
           )
         ORDER BY session.created_at ASC, session.id ASC`,
        [organizationId, locationId, actor.membershipId],
      );

      await client.query("COMMIT");

      return {
        continuations: rowsResult.rows.map((row) => ({
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
