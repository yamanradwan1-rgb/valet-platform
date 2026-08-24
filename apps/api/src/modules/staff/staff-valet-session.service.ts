import { Inject, Injectable } from "@nestjs/common";
import type {
  StaffValetSessionDetailResponse,
  StaffValetSessionState,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import {
  authorizeCustodyActorForPersistedScope,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "./custody-staff-authorizer";
import {
  authorizeSessionAccess,
  validateTemporalInvariants,
} from "./staff-valet-session-authorization";
import {
  loadGuestAccess,
  loadHandoffVerification,
  loadKeySlot,
  loadParking,
  loadParkingTasks,
  loadSessionScope,
  loadVehicle,
} from "./staff-valet-session-queries";

@Injectable()
export class StaffValetSessionService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async getSessionDetail(
    authenticatedUserId: string,
    sessionId: string,
  ): Promise<StaffValetSessionDetailResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await requireActiveCustodyUser(client, authenticatedUserId);

      const session = await loadSessionScope(client, sessionId);
      const actor = await authorizeCustodyActorForPersistedScope(client, {
        allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
        authenticatedUserId,
        resourceScope: {
          locationId: session.location_id,
          organizationId: session.organization_id,
        },
      });

      const eligibility = await lockShiftOperationalEligibility(client, {
        locationId: session.location_id,
        membershipId: actor.membershipId,
      });
      if (eligibility === null) {
        throw new CustodyStaffAuthorizationError("LOCATION_ACCESS_DENIED");
      }

      const tasks = await loadParkingTasks(client, session);
      authorizeSessionAccess(session, tasks, actor.membershipId, actor.role);
      validateTemporalInvariants(session);

      const vehicle = await loadVehicle(client, session);
      const keySlot = await loadKeySlot(client, session);
      const parking = await loadParking(client, session);
      const verification = await loadHandoffVerification(client, session);
      const guestAccess = await loadGuestAccess(client, session);

      await client.query("COMMIT");

      return {
        checkIn: {
          conditionCompletedAt: session.check_in_condition_completed_at
            ? session.check_in_condition_completed_at.toISOString()
            : null,
        },
        guestAccess: {
          expiresAt: guestAccess.expiresAt
            ? guestAccess.expiresAt.toISOString()
            : null,
          revokedAt: guestAccess.revokedAt
            ? guestAccess.revokedAt.toISOString()
            : null,
          status: guestAccess.status,
        },
        handoff: {
          pendingAt:
            session.state === "HANDOFF_PENDING" &&
            session.handoff_pending_at !== null
              ? session.handoff_pending_at.toISOString()
              : null,
          verification:
            verification === null
              ? null
              : {
                  method: verification.method,
                  status: verification.verifiedAt === null ? "PENDING" : "VERIFIED",
                  verifiedAt:
                    verification.verifiedAt === null
                      ? null
                      : verification.verifiedAt.toISOString(),
                },
        },
        keySlot: keySlot ? { code: keySlot.code } : null,
        locationId: session.location_id,
        parking: {
          parkedAt: session.parked_at
            ? session.parked_at.toISOString()
            : null,
          parkingSpotCode: parking?.spotCode ?? null,
          parkingStartedAt: session.parking_started_at
            ? session.parking_started_at.toISOString()
            : null,
          parkingZoneCode: parking?.zoneCode ?? null,
        },
        sessionId: session.id,
        state: session.state as StaffValetSessionState,
        vehicle: {
          color: vehicle.color,
          make: vehicle.make,
          model: vehicle.model,
          plateCountry: vehicle.plate_country,
          plateNumberRaw: vehicle.plate_number_raw,
          temporaryDescriptor: vehicle.temporary_descriptor,
          vehicleId: vehicle.id,
          vehicleUpdatedAt: vehicle.updated_at.toISOString(),
        },
        version: session.version,
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
