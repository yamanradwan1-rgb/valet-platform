import { Inject, Injectable } from "@nestjs/common";
import type { StaffVehicleDirectoryResponse } from "@valet/contracts";

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
import { classifyStaffValetSessionAccess } from "./staff-valet-session-authorization";
import {
  applyDirectoryPageCap,
  loadDirectoryCandidates,
  loadDirectoryKeySlots,
  loadDirectoryParking,
  loadDirectoryTasks,
  loadDirectoryVehicles,
  loadDirectoryZones,
  resolveDirectoryLocationScope,
  type DirectoryCandidateRow,
  type DirectoryTaskRow,
  type DirectoryVehicleRow,
} from "./staff-vehicle-directory.queries";

/**
 * Read-only Employee operational vehicle directory (DEC-066 §6–§10).
 *
 * Authority chain inside one transaction: active staff user; requested
 * Location selector resolved to its persisted Organization (the selector is
 * never authority); ACTIVE membership + exact Location access + operational
 * role via the shared custody authorizer; same-Location ACTIVE Shift
 * eligibility per DEC-032 §10/§11.
 *
 * Row visibility: VALET_SUPERVISOR sees every non-COMPLETED candidate of the
 * proven Location. VALET_EMPLOYEE visibility reuses the accepted custody
 * state/task ownership semantics through the shared pure classifier.
 *
 * Field masking: supervisor rows carry Key Slot codes inside the proven
 * Location; employee rows always carry keySlotCode null (fail closed,
 * DEC-066 §8). Visibility never grants command authority.
 */
@Injectable()
export class StaffVehicleDirectoryService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async getVehicleDirectory(
    authenticatedUserId: string,
    requestedLocationId: string,
  ): Promise<StaffVehicleDirectoryResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await requireActiveCustodyUser(client, authenticatedUserId);

      const scope = await resolveDirectoryLocationScope(
        client,
        requestedLocationId,
      );
      if (scope === null) {
        throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
      }

      const actor = await authorizeCustodyActorForPersistedScope(client, {
        allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
        authenticatedUserId,
        resourceScope: {
          locationId: requestedLocationId,
          organizationId: scope.organizationId,
        },
      });

      const eligibility = await lockShiftOperationalEligibility(client, {
        locationId: requestedLocationId,
        membershipId: actor.membershipId,
      });
      if (eligibility === null) {
        throw new CustodyStaffAuthorizationError("LOCATION_ACCESS_DENIED");
      }

      const candidates = await loadDirectoryCandidates(
        client,
        scope.organizationId,
        requestedLocationId,
      );
      const page = applyDirectoryPageCap(candidates);
      const rows =
        actor.role === "VALET_SUPERVISOR"
          ? await this.buildSupervisorRows(client, page.rows, {
              locationId: requestedLocationId,
              organizationId: scope.organizationId,
            })
          : await this.buildEmployeeRows(
              client,
              page.rows,
              actor.membershipId,
              {
                locationId: requestedLocationId,
                organizationId: scope.organizationId,
              },
            );

      await client.query("COMMIT");

      return {
        locationId: requestedLocationId,
        rows,
        truncated: page.truncated,
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

  private async buildSupervisorRows(
    client: PostgresTransaction,
    candidates: readonly DirectoryCandidateRow[],
    scope: { readonly locationId: string; readonly organizationId: string },
  ): Promise<StaffVehicleDirectoryResponse["rows"]> {
    const loaded = await this.loadProjections(client, candidates, scope);
    return candidates.map((candidate) => {
      const vehicle = requireVehicle(loaded.vehicles, candidate);
      const slot = candidate.key_slot_id
        ? loaded.keySlots.get(candidate.key_slot_id)
        : undefined;
      return {
        createdAt: candidate.created_at.toISOString(),
        keySlotCode: slot?.code ?? null,
        keySlotVisibility:
          candidate.key_slot_id === null ? "UNASSIGNED" : "VISIBLE",
        parkingSpotCode:
          candidate.parking_spot_id === null
            ? null
            : (loaded.parking.get(candidate.parking_spot_id)?.spot_code ??
              null),
        parkingZoneCode:
          candidate.parking_zone_id === null ||
          (candidate.parking_spot_id === null &&
            !["PARKED", "REQUESTED"].includes(candidate.state))
            ? null
            : (loaded.zones.get(candidate.parking_zone_id)?.code ?? null),
        sessionId: candidate.id,
        state:
          candidate.state as StaffVehicleDirectoryResponse["rows"][number]["state"],
        updatedAt: candidate.updated_at.toISOString(),
        vehicle: toVehicleProjection(vehicle),
      };
    });
  }

  private async buildEmployeeRows(
    client: PostgresTransaction,
    candidates: readonly DirectoryCandidateRow[],
    actorMembershipId: string,
    scope: { readonly locationId: string; readonly organizationId: string },
  ): Promise<StaffVehicleDirectoryResponse["rows"]> {
    const tasks = await loadDirectoryTasks(
      client,
      scope.organizationId,
      scope.locationId,
      candidates.map((candidate) => candidate.id),
    );
    const tasksBySession = new Map<string, DirectoryTaskRow[]>();
    for (const task of tasks) {
      const existing = tasksBySession.get(task.valet_session_id);
      if (existing === undefined)
        tasksBySession.set(task.valet_session_id, [task]);
      else existing.push(task);
    }

    const visible = candidates.filter(
      (candidate) =>
        classifyStaffValetSessionAccess(
          candidate,
          tasksBySession.get(candidate.id) ?? [],
          actorMembershipId,
        ) === "ACCESS_ALLOWED",
    );
    const loaded = await this.loadProjections(client, visible, scope);

    return visible.map((candidate) => {
      const vehicle = requireVehicle(loaded.vehicles, candidate);
      return {
        createdAt: candidate.created_at.toISOString(),
        // Fail closed (DEC-066 §8): no directory-list disclosure rule exists
        // for employee Key Slot detail; QUEUED visibility never discloses.
        keySlotCode: null,
        keySlotVisibility:
          candidate.key_slot_id === null ? "UNASSIGNED" : "RESTRICTED",
        parkingSpotCode:
          candidate.parking_spot_id === null
            ? null
            : (loaded.parking.get(candidate.parking_spot_id)?.spot_code ??
              null),
        parkingZoneCode:
          candidate.parking_zone_id === null ||
          (candidate.parking_spot_id === null &&
            !["PARKED", "REQUESTED"].includes(candidate.state))
            ? null
            : (loaded.zones.get(candidate.parking_zone_id)?.code ?? null),
        sessionId: candidate.id,
        state:
          candidate.state as StaffVehicleDirectoryResponse["rows"][number]["state"],
        updatedAt: candidate.updated_at.toISOString(),
        vehicle: toVehicleProjection(vehicle),
      };
    });
  }

  private async loadProjections(
    client: PostgresTransaction,
    candidates: readonly DirectoryCandidateRow[],
    scope: { readonly locationId: string; readonly organizationId: string },
  ) {
    const vehicleIds = candidates.map((candidate) => candidate.vehicle_id);
    const spotIds = candidates
      .map((candidate) => candidate.parking_spot_id)
      .filter((spotId): spotId is string => spotId !== null);
    const zoneIds = candidates
      .map((candidate) => candidate.parking_zone_id)
      .filter((zoneId): zoneId is string => zoneId !== null);
    const slotIds = candidates
      .map((candidate) => candidate.key_slot_id)
      .filter((slotId): slotId is string => slotId !== null);
    return {
      keySlots: await loadDirectoryKeySlots(
        client,
        scope.organizationId,
        scope.locationId,
        slotIds,
      ),
      parking: await loadDirectoryParking(
        client,
        scope.organizationId,
        scope.locationId,
        spotIds,
      ),
      zones: await loadDirectoryZones(
        client,
        scope.organizationId,
        scope.locationId,
        zoneIds,
      ),
      vehicles: await loadDirectoryVehicles(
        client,
        scope.organizationId,
        vehicleIds,
      ),
    };
  }
}

function requireVehicle(
  vehicles: Map<string, DirectoryVehicleRow>,
  candidate: DirectoryCandidateRow,
) {
  const vehicle = vehicles.get(candidate.vehicle_id);
  if (vehicle === undefined) {
    throw new Error("Corrupted state: referenced vehicle missing.");
  }
  return vehicle;
}

function toVehicleProjection(vehicle: {
  color: string | null;
  make: string | null;
  model: string | null;
  plate_country: string | null;
  plate_number_raw: string | null;
  temporary_descriptor: string | null;
}) {
  return {
    color: vehicle.color,
    make: vehicle.make,
    model: vehicle.model,
    plateCountry: vehicle.plate_country,
    plateNumberRaw: vehicle.plate_number_raw,
    temporaryDescriptor: vehicle.temporary_descriptor,
  };
}
