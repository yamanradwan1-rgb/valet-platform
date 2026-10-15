import { Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContext,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { ConditionPhotoBackendService } from "../vehicle-photos/condition-photo-backend.service";
import { createCheckInPhotoPreflight } from "../valet-sessions/check-in-photo-preflight";
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
  createIntakeSessionCommandExecutor,
  type IntakeSessionCommandRequest,
} from "../valet-sessions/intake-session-command";
import {
  createVehicleIdentityCommandExecutor,
  type VehicleIdentityCommandRequest,
} from "../vehicles/vehicle-identity-command";
import {
  createVehicleDetailsCommandExecutor,
  type VehicleDetailsCommandRequest,
} from "../vehicles/vehicle-details-command";
import {
  createReturningVehicleRecognitionQuery,
  type ReturningVehicleRecognitionRequest,
} from "../vehicles/returning-vehicle-recognition";

@Injectable()
export class CheckInApiService {
  private readonly completeCheckIn;
  private readonly completeCondition;
  private readonly correctConditionNote;
  private readonly intake;
  private readonly recordConditionNote;
  private readonly registerConditionPhoto;
  private readonly returningVehicleRecognition;
  private readonly updateVehicleDetails;
  private readonly updateVehicleIdentity;
  private readonly qualificationActive;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Optional() private readonly conditionPhotos?: ConditionPhotoBackendService,
    @Optional() @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly staffSessions?: StaffSessionContextResolver,
  ) {
    const qualification = this.conditionPhotos?.trustedQualificationStore();
    this.qualificationActive = qualification !== undefined;
    const photoPreflight = qualification === undefined ? undefined :
      createCheckInPhotoPreflight(pool, qualification.store, qualification.bucketAlias);
    this.completeCheckIn = createCompleteCheckInCommandExecutor(pool, {
      ...(photoPreflight === undefined ? {} : { photoPreflight }),
    });
    this.completeCondition =
      createCompleteCheckInConditionCommandExecutor(pool, {
        ...(qualification === undefined ? {} : {
          photoPreflight: createCheckInPhotoPreflight(
            pool, qualification.store, qualification.bucketAlias, true,
          ),
        }),
      });
    this.correctConditionNote =
      createCorrectCheckInConditionNoteCommandExecutor(pool);
    this.intake = createIntakeSessionCommandExecutor(pool);
    this.recordConditionNote =
      createRecordCheckInConditionNoteCommandExecutor(pool);
    this.registerConditionPhoto =
      createRegisterCheckInConditionPhotoCommandExecutor(pool);
    this.returningVehicleRecognition =
      createReturningVehicleRecognitionQuery(pool);
    this.updateVehicleDetails = createVehicleDetailsCommandExecutor(pool);
    this.updateVehicleIdentity = createVehicleIdentityCommandExecutor(pool);
  }

  executeIntake(request: IntakeSessionCommandRequest) {
    return this.intake(request);
  }

  executeVehicleIdentity(request: VehicleIdentityCommandRequest) {
    return this.updateVehicleIdentity(request);
  }

  recognizeReturningVehicle(request: ReturningVehicleRecognitionRequest) {
    return this.returningVehicleRecognition(request);
  }

  correctVehicleDetails(request: VehicleDetailsCommandRequest) {
    return this.updateVehicleDetails(request);
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

  private async currentCredential(
    userId: string,
    authorization?: string,
  ): Promise<StaffSessionContext | undefined> {
    if (!this.qualificationActive) return undefined;
    if (!this.staffSessions || !authorization) throw new UnauthorizedException();
    const credential = await this.staffSessions.resolve(authorization);
    if (credential.userId !== userId) throw new UnauthorizedException();
    return credential;
  }

  async executeConditionCompletion(
    request: CheckInConditionStaffRequest,
    authorization?: string,
  ) {
    return this.completeCondition(request,
      await this.currentCredential(request.authenticatedUserId, authorization));
  }

  async executeCompleteCheckIn(
    request: CompleteCheckInCommandRequest,
    authorization?: string,
  ) {
    const result = await this.completeCheckIn(request,
      await this.currentCredential(request.authenticatedUserId, authorization));
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
}
