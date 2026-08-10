import { Inject, Injectable } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import {
  createCompleteCheckInConditionCommandExecutor,
  createCorrectCheckInConditionNoteCommandExecutor,
  createRecordCheckInConditionNoteCommandExecutor,
  createRegisterCheckInConditionPhotoCommandExecutor,
  type CheckInConditionStaffRequest,
  type CorrectCheckInConditionNoteRequest,
  type RecordCheckInConditionNoteRequest,
  type RegisterCheckInConditionPhotoRequest,
} from "../valet-sessions/check-in-condition-command";
import {
  createCompleteCheckInCommandExecutor,
  type CompleteCheckInCommandRequest,
} from "../valet-sessions/complete-check-in-command";
import {
  createGuestAccessResolver,
  createIssueGuestAccessCommandExecutor,
  createRevokeGuestAccessCommandExecutor,
  type IssueGuestAccessRequest,
  type StaffGuestAccessRequest,
  GuestAccessError,
  resolveGuestAccessWithDatabase,
} from "../valet-sessions/guest-access-command";
import {
  createIntakeSessionCommandExecutor,
  type IntakeSessionCommandRequest,
} from "../valet-sessions/intake-session-command";
import {
  createVehicleIdentityCommandExecutor,
  type VehicleIdentityCommandRequest,
} from "../vehicles/vehicle-identity-command";
import { CHECK_IN_POSTGRES_POOL } from "./check-in-api.boundaries";

@Injectable()
export class CheckInApiService {
  private readonly completeCheckIn;
  private readonly completeCondition;
  private readonly correctConditionNote;
  private readonly intake;
  private readonly issueGuestAccess;
  private readonly recordConditionNote;
  private readonly registerConditionPhoto;
  private readonly resolveGuestAccess;
  private readonly revokeGuestAccess;
  private readonly updateVehicleIdentity;

  constructor(
    @Inject(CHECK_IN_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {
    this.completeCheckIn = createCompleteCheckInCommandExecutor(pool);
    this.completeCondition =
      createCompleteCheckInConditionCommandExecutor(pool);
    this.correctConditionNote =
      createCorrectCheckInConditionNoteCommandExecutor(pool);
    this.intake = createIntakeSessionCommandExecutor(pool);
    this.issueGuestAccess = createIssueGuestAccessCommandExecutor(pool);
    this.recordConditionNote =
      createRecordCheckInConditionNoteCommandExecutor(pool);
    this.registerConditionPhoto =
      createRegisterCheckInConditionPhotoCommandExecutor(pool);
    this.resolveGuestAccess = createGuestAccessResolver(pool);
    this.revokeGuestAccess = createRevokeGuestAccessCommandExecutor(pool);
    this.updateVehicleIdentity = createVehicleIdentityCommandExecutor(pool);
  }

  executeIntake(request: IntakeSessionCommandRequest) {
    return this.intake(request);
  }

  executeVehicleIdentity(request: VehicleIdentityCommandRequest) {
    return this.updateVehicleIdentity(request);
  }

  executeConditionNote(request: RecordCheckInConditionNoteRequest) {
    return this.recordConditionNote(request);
  }

  executeConditionCorrection(request: CorrectCheckInConditionNoteRequest) {
    return this.correctConditionNote(request);
  }

  executeConditionPhoto(request: RegisterCheckInConditionPhotoRequest) {
    return this.registerConditionPhoto(request);
  }

  executeConditionCompletion(request: CheckInConditionStaffRequest) {
    return this.completeCondition(request);
  }

  executeGuestIssue(request: IssueGuestAccessRequest) {
    return this.issueGuestAccess(request);
  }

  executeGuestRevoke(request: StaffGuestAccessRequest) {
    return this.revokeGuestAccess(request);
  }

  resolveGuest(rawToken: string) {
    return this.resolveGuestAccess(rawToken);
  }

  async resolveGuestInTransaction(
    transaction: PostgresTransaction,
    rawToken: string,
  ) {
    try {
      return await resolveGuestAccessWithDatabase(transaction, rawToken);
    } catch (error) {
      if (error instanceof GuestAccessError) return undefined;
      throw error;
    }
  }

  async executeCompleteCheckIn(request: CompleteCheckInCommandRequest) {
    const result = await this.completeCheckIn(request);
    let checkInElapsedMs: number | undefined;
    try {
      const timestamps = await this.pool.query<{
        checking_in_completed_at: Date;
        created_at: Date;
      }>(
        `SELECT created_at, checking_in_completed_at
         FROM valet_sessions
         WHERE id = $1
           AND organization_id = $2
           AND location_id = $3`,
        [result.valetSessionId, result.organizationId, result.locationId],
      );
      const row = timestamps.rows[0];
      if (row !== undefined) {
        checkInElapsedMs = Math.max(
          0,
          row.checking_in_completed_at.getTime() - row.created_at.getTime(),
        );
      }
    } catch {
      // The committed command result is authoritative; KPI reads are optional.
    }
    return { checkInElapsedMs, result };
  }

  async loadVehicleUpdatedAt(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<Date> {
    const result = await this.pool.query<{ updated_at: Date }>(
      `SELECT updated_at
       FROM vehicles
       WHERE organization_id = $1
         AND id = $2`,
      [input.organizationId, input.vehicleId],
    );
    const updatedAt = result.rows[0]?.updated_at;
    if (updatedAt === undefined) {
      throw new Error("Authorized intake Vehicle token was not available.");
    }
    return updatedAt;
  }
}
