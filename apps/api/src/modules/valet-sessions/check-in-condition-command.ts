import {
  authorizeAndLockCheckInConditionSession as authorizeAndLockSession,
  type CheckInConditionSessionRow as SessionScopeRow,
} from "./check-in-condition-authorization";
import { randomUUID } from "node:crypto";

import type { DatabaseError } from "pg";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";
import { CustodyMutationError } from "./protected-custody-command";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { UnauthorizedException } from "@nestjs/common";
import {
  evaluateLockedCheckInConditionGuard,
  type TrustedCheckInPhotoContext,
} from "./check-in-condition-guard";
export {
  evaluateEffectiveCheckInPhotoPolicy,
  evaluateLockedCheckInConditionGuard,
} from "./check-in-condition-guard";
export type {
  CheckInPhotoPolicySource,
  EffectiveCheckInPhotoPolicy,
  LockedCheckInConditionGuardScope,
  CheckInConditionGuardResult,
} from "./check-in-condition-guard";

export const checkInConditionLimits = {
  contentTypeCodePoints: 127,
  noteContentCodePoints: 1_000,
  storageObjectKeyCodePoints: 512,
} as const;

export type CheckInConditionCommandErrorCode =
  | "CHECK_IN_CONDITION_PHOTO_REQUIRED"
  | "CHECK_IN_EVIDENCE_REQUEST_INVALID"
  | "CONDITION_NOTE_ALREADY_SUPERSEDED"
  | "PHOTO_STORAGE_OBJECT_CONFLICT";

const errorMessages: Record<CheckInConditionCommandErrorCode, string> = {
  CHECK_IN_CONDITION_PHOTO_REQUIRED:
    "Check-in condition completion requires photo evidence.",
  CHECK_IN_EVIDENCE_REQUEST_INVALID:
    "The check-in condition evidence request is invalid.",
  CONDITION_NOTE_ALREADY_SUPERSEDED:
    "The condition note already has a direct correction.",
  PHOTO_STORAGE_OBJECT_CONFLICT:
    "The photo storage object cannot be registered for this request.",
};

export class CheckInConditionCommandError extends Error {
  readonly code: CheckInConditionCommandErrorCode;

  constructor(code: CheckInConditionCommandErrorCode) {
    super(errorMessages[code]);
    this.name = "CheckInConditionCommandError";
    this.code = code;
  }
}

export interface CheckInConditionStaffRequest {
  readonly authenticatedUserId: string;
  readonly valetSessionId: string;
}

export interface RecordCheckInConditionNoteRequest extends CheckInConditionStaffRequest {
  readonly content: string;
}

export interface CorrectCheckInConditionNoteRequest extends CheckInConditionStaffRequest {
  readonly content: string;
  readonly supersedesConditionNoteId: string;
}

export interface RegisterCheckInConditionPhotoRequest extends CheckInConditionStaffRequest {
  readonly contentType: string;
  readonly storageObjectKey: string;
}

export interface CheckInConditionNoteResult {
  readonly conditionNoteId: string;
  readonly content: string;
  readonly createdAt: Date;
  readonly recordedByMembershipId: string;
  readonly supersedesConditionNoteId: string | null;
  readonly valetSessionId: string;
}

export interface CheckInConditionPhotoResult {
  readonly capturedByMembershipId: string;
  readonly contentType: string;
  readonly createdAt: Date;
  readonly valetSessionId: string;
  readonly vehiclePhotoId: string;
}

export interface CompleteCheckInConditionResult {
  readonly completedAt: Date;
  readonly completedByMembershipId: string;
  readonly valetSessionId: string;
}

interface CheckInConditionCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly conditionNoteIdFactory?: () => string;
  readonly vehiclePhotoIdFactory?: () => string;
  readonly photoPreflight?: (request: CheckInConditionStaffRequest) =>
    Promise<TrustedCheckInPhotoContext>;
}

interface ConditionNoteRow {
  content: string;
  created_at: Date;
  id: string;
  recorded_by_membership_id: string;
  supersedes_condition_note_id: string | null;
  valet_session_id: string;
}

interface VehiclePhotoRow {
  captured_by_membership_id: string;
  content_type: string;
  created_at: Date;
  id: string;
  location_id: string;
  organization_id: string;
  purpose: string;
  storage_object_key: string;
  valet_session_id: string;
}

const controlCharacterPattern = /\p{Cc}/u;
const imageContentTypePattern = /^image\/[a-z0-9!#$%&'*+.^_`|~-]+$/i;
const publicUrlPattern = /^https?:\/\//i;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidRequest(): never {
  throw new CheckInConditionCommandError("CHECK_IN_EVIDENCE_REQUEST_INVALID");
}

function assertOnlyKeys(value: object, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    return invalidRequest();
  }
}

function normalizeUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    return invalidRequest();
  }
  return value.toLowerCase();
}

function normalizeBoundedText(value: unknown, maximum: number): string {
  if (typeof value !== "string") {
    return invalidRequest();
  }
  const normalized = value.trim();
  if (
    normalized === "" ||
    Array.from(normalized).length > maximum ||
    controlCharacterPattern.test(normalized)
  ) {
    return invalidRequest();
  }
  return normalized;
}

function normalizeStaffFields(request: CheckInConditionStaffRequest): {
  authenticatedUserId: string;
  valetSessionId: string;
} {
  return {
    authenticatedUserId: normalizeUuid(request.authenticatedUserId),
    valetSessionId: normalizeUuid(request.valetSessionId),
  };
}

function normalizeRecordRequest(
  request: RecordCheckInConditionNoteRequest,
): RecordCheckInConditionNoteRequest {
  if (request === null || typeof request !== "object") {
    return invalidRequest();
  }
  assertOnlyKeys(request, ["authenticatedUserId", "content", "valetSessionId"]);
  return {
    ...normalizeStaffFields(request),
    content: normalizeBoundedText(
      request.content,
      checkInConditionLimits.noteContentCodePoints,
    ),
  };
}

function normalizeCorrectionRequest(
  request: CorrectCheckInConditionNoteRequest,
): CorrectCheckInConditionNoteRequest {
  if (request === null || typeof request !== "object") {
    return invalidRequest();
  }
  assertOnlyKeys(request, [
    "authenticatedUserId",
    "content",
    "supersedesConditionNoteId",
    "valetSessionId",
  ]);
  return {
    ...normalizeStaffFields(request),
    content: normalizeBoundedText(
      request.content,
      checkInConditionLimits.noteContentCodePoints,
    ),
    supersedesConditionNoteId: normalizeUuid(request.supersedesConditionNoteId),
  };
}

function normalizePhotoRequest(
  request: RegisterCheckInConditionPhotoRequest,
): RegisterCheckInConditionPhotoRequest {
  if (request === null || typeof request !== "object") {
    return invalidRequest();
  }
  assertOnlyKeys(request, [
    "authenticatedUserId",
    "contentType",
    "storageObjectKey",
    "valetSessionId",
  ]);
  const storageObjectKey = normalizeBoundedText(
    request.storageObjectKey,
    checkInConditionLimits.storageObjectKeyCodePoints,
  );
  if (publicUrlPattern.test(storageObjectKey)) {
    return invalidRequest();
  }
  const contentType = normalizeBoundedText(
    request.contentType,
    checkInConditionLimits.contentTypeCodePoints,
  ).toLowerCase();
  if (!imageContentTypePattern.test(contentType)) {
    return invalidRequest();
  }
  return {
    ...normalizeStaffFields(request),
    contentType,
    storageObjectKey,
  };
}

function normalizeStaffRequest(
  request: CheckInConditionStaffRequest,
): CheckInConditionStaffRequest {
  if (request === null || typeof request !== "object") {
    return invalidRequest();
  }
  assertOnlyKeys(request, ["authenticatedUserId", "valetSessionId"]);
  return normalizeStaffFields(request);
}

async function inTransaction<T>(
  pool: PostgresPool,
  operation: (transaction: PostgresTransaction) => Promise<T>,
): Promise<T> {
  const transaction = await pool.connect();
  try {
    await transaction.query("BEGIN");
    const result = await operation(transaction);
    await transaction.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await transaction.query("ROLLBACK");
    } catch {
      // Preserve the original check-in condition command failure.
    }
    throw error;
  } finally {
    transaction.release();
  }
}

async function serverTime(transaction: PostgresTransaction): Promise<Date> {
  const result = await transaction.query<{ operation_time: Date }>(
    `SELECT clock_timestamp() AS operation_time`,
  );
  const operationTime = result.rows[0]?.operation_time;
  if (operationTime === undefined) {
    throw new Error("Database did not provide an operation timestamp.");
  }
  return operationTime;
}

function requireCheckingIn(session: SessionScopeRow): void {
  if (session.state !== "CHECKING_IN") {
    throw new CustodyMutationError("INVALID_STATE_TRANSITION");
  }
}

function conditionNoteResult(
  row: ConditionNoteRow,
): CheckInConditionNoteResult {
  return {
    conditionNoteId: row.id,
    content: row.content,
    createdAt: row.created_at,
    recordedByMembershipId: row.recorded_by_membership_id,
    supersedesConditionNoteId: row.supersedes_condition_note_id,
    valetSessionId: row.valet_session_id,
  };
}

function vehiclePhotoResult(row: VehiclePhotoRow): CheckInConditionPhotoResult {
  return {
    capturedByMembershipId: row.captured_by_membership_id,
    contentType: row.content_type,
    createdAt: row.created_at,
    valetSessionId: row.valet_session_id,
    vehiclePhotoId: row.id,
  };
}

export function createRecordCheckInConditionNoteCommandExecutor(
  pool: PostgresPool,
  options: CheckInConditionCommandOptions = {},
): (
  request: RecordCheckInConditionNoteRequest,
) => Promise<CheckInConditionNoteResult> {
  return async (request) => {
    const normalized = normalizeRecordRequest(request);
    return inTransaction(pool, async (transaction) => {
      const { actorMembershipId, session } = await authorizeAndLockSession(
        transaction,
        normalized,
      );
      requireCheckingIn(session);
      const operationTime = await serverTime(transaction);
      const noteResult = await transaction.query<ConditionNoteRow>(
        `INSERT INTO condition_notes
           (id, organization_id, location_id, valet_session_id, context,
            content, supersedes_condition_note_id,
            recorded_by_membership_id, created_at)
         VALUES ($1, $2, $3, $4, 'CHECK_IN', $5, NULL, $6, $7)
         RETURNING id::text, valet_session_id::text, content,
                   supersedes_condition_note_id::text,
                   recorded_by_membership_id::text, created_at`,
        [
          options.conditionNoteIdFactory?.() ?? randomUUID(),
          session.organization_id,
          session.location_id,
          session.valet_session_id,
          normalized.content,
          actorMembershipId,
          operationTime,
        ],
      );
      const note = noteResult.rows[0];
      if (note === undefined) {
        throw new Error("Condition-note insert returned no evidence.");
      }
      await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: "CHECK_IN_CONDITION_NOTE_RECORDED",
            metadata: {
              context: "CHECK_IN",
              mutationKind: "RECORD",
              supersedesEvidence: false,
            },
          },
          occurredAt: operationTime,
          scope: {
            actorMembershipId,
            locationId: session.location_id,
            organizationId: session.organization_id,
            valetSessionId: session.valet_session_id,
          },
        },
        options.auditEventIdFactory ?? randomUUID,
      );
      return conditionNoteResult(note);
    });
  };
}

export function createCorrectCheckInConditionNoteCommandExecutor(
  pool: PostgresPool,
  options: CheckInConditionCommandOptions = {},
): (
  request: CorrectCheckInConditionNoteRequest,
) => Promise<CheckInConditionNoteResult> {
  return async (request) => {
    const normalized = normalizeCorrectionRequest(request);
    return inTransaction(pool, async (transaction) => {
      const { actorMembershipId, session } = await authorizeAndLockSession(
        transaction,
        normalized,
      );
      requireCheckingIn(session);
      const targetResult = await transaction.query<{ id: string }>(
        `SELECT id::text
         FROM condition_notes
         WHERE id = $1
           AND organization_id = $2
           AND location_id = $3
           AND valet_session_id = $4
           AND context = 'CHECK_IN'`,
        [
          normalized.supersedesConditionNoteId,
          session.organization_id,
          session.location_id,
          session.valet_session_id,
        ],
      );
      if (targetResult.rows[0] === undefined) {
        throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
      }
      const successorResult = await transaction.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM condition_notes
           WHERE organization_id = $1
             AND location_id = $2
             AND valet_session_id = $3
             AND context = 'CHECK_IN'
             AND supersedes_condition_note_id = $4
         ) AS exists`,
        [
          session.organization_id,
          session.location_id,
          session.valet_session_id,
          normalized.supersedesConditionNoteId,
        ],
      );
      if (successorResult.rows[0]?.exists === true) {
        throw new CheckInConditionCommandError(
          "CONDITION_NOTE_ALREADY_SUPERSEDED",
        );
      }
      const operationTime = await serverTime(transaction);
      const noteResult = await transaction.query<ConditionNoteRow>(
        `INSERT INTO condition_notes
           (id, organization_id, location_id, valet_session_id, context,
            content, supersedes_condition_note_id,
            recorded_by_membership_id, created_at)
         VALUES ($1, $2, $3, $4, 'CHECK_IN', $5, $6, $7, $8)
         RETURNING id::text, valet_session_id::text, content,
                   supersedes_condition_note_id::text,
                   recorded_by_membership_id::text, created_at`,
        [
          options.conditionNoteIdFactory?.() ?? randomUUID(),
          session.organization_id,
          session.location_id,
          session.valet_session_id,
          normalized.content,
          normalized.supersedesConditionNoteId,
          actorMembershipId,
          operationTime,
        ],
      );
      const note = noteResult.rows[0];
      if (note === undefined) {
        throw new Error("Condition-note correction returned no evidence.");
      }
      await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: "CHECK_IN_CONDITION_NOTE_CORRECTED",
            metadata: {
              context: "CHECK_IN",
              mutationKind: "CORRECTION",
              supersedesEvidence: true,
            },
          },
          occurredAt: operationTime,
          scope: {
            actorMembershipId,
            locationId: session.location_id,
            organizationId: session.organization_id,
            valetSessionId: session.valet_session_id,
          },
        },
        options.auditEventIdFactory ?? randomUUID,
      );
      return conditionNoteResult(note);
    });
  };
}

function samePhotoRegistration(
  photo: VehiclePhotoRow,
  input: RegisterCheckInConditionPhotoRequest,
  session: SessionScopeRow,
  actorMembershipId: string,
): boolean {
  return (
    photo.organization_id === session.organization_id &&
    photo.location_id === session.location_id &&
    photo.valet_session_id === session.valet_session_id &&
    photo.purpose === "CHECK_IN_CONDITION" &&
    photo.captured_by_membership_id === actorMembershipId &&
    photo.content_type === input.contentType
  );
}

function isPhotoStorageObjectConflict(error: unknown): boolean {
  const databaseError = error as Partial<DatabaseError>;
  return (
    databaseError.code === "23505" &&
    databaseError.constraint === "vehicle_photos_storage_object_key_key"
  );
}

export function createRegisterCheckInConditionPhotoCommandExecutor(
  pool: PostgresPool,
  options: CheckInConditionCommandOptions = {},
): (
  request: RegisterCheckInConditionPhotoRequest,
) => Promise<CheckInConditionPhotoResult> {
  return async (request) => {
    const normalized = normalizePhotoRequest(request);
    try {
      return await inTransaction(pool, async (transaction) => {
        const { actorMembershipId, session } = await authorizeAndLockSession(
          transaction,
          normalized,
        );
        const existingResult = await transaction.query<VehiclePhotoRow>(
          `SELECT id::text, organization_id::text, location_id::text,
                  valet_session_id::text, captured_by_membership_id::text,
                  purpose::text, storage_object_key, content_type, created_at
           FROM vehicle_photos
           WHERE storage_object_key = $1`,
          [normalized.storageObjectKey],
        );
        const existing = existingResult.rows[0];
        if (existing !== undefined) {
          if (
            !samePhotoRegistration(
              existing,
              normalized,
              session,
              actorMembershipId,
            )
          ) {
            throw new CheckInConditionCommandError(
              "PHOTO_STORAGE_OBJECT_CONFLICT",
            );
          }
          return vehiclePhotoResult(existing);
        }

        requireCheckingIn(session);
        const operationTime = await serverTime(transaction);
        const photoResult = await transaction.query<VehiclePhotoRow>(
          `INSERT INTO vehicle_photos
             (id, organization_id, location_id, valet_session_id,
              captured_by_membership_id, purpose, storage_object_key,
              content_type, created_at)
           VALUES ($1, $2, $3, $4, $5, 'CHECK_IN_CONDITION', $6, $7, $8)
           RETURNING id::text, organization_id::text, location_id::text,
                     valet_session_id::text, captured_by_membership_id::text,
                     purpose::text, storage_object_key, content_type, created_at`,
          [
            options.vehiclePhotoIdFactory?.() ?? randomUUID(),
            session.organization_id,
            session.location_id,
            session.valet_session_id,
            actorMembershipId,
            normalized.storageObjectKey,
            normalized.contentType,
            operationTime,
          ],
        );
        const photo = photoResult.rows[0];
        if (photo === undefined) {
          throw new Error("Vehicle-photo registration returned no evidence.");
        }
        await appendCustodyAuditEvent(
          transaction,
          {
            definition: {
              eventType: "CHECK_IN_CONDITION_PHOTO_REGISTERED",
              metadata: {
                mediaCategory: "image",
                mutationKind: "REGISTER",
                purpose: "CHECK_IN_CONDITION",
              },
            },
            occurredAt: operationTime,
            scope: {
              actorMembershipId,
              locationId: session.location_id,
              organizationId: session.organization_id,
              valetSessionId: session.valet_session_id,
            },
          },
          options.auditEventIdFactory ?? randomUUID,
        );
        return vehiclePhotoResult(photo);
      });
    } catch (error) {
      if (isPhotoStorageObjectConflict(error)) {
        throw new CheckInConditionCommandError("PHOTO_STORAGE_OBJECT_CONFLICT");
      }
      throw error;
    }
  };
}

export function createCompleteCheckInConditionCommandExecutor(
  pool: PostgresPool,
  options: CheckInConditionCommandOptions = {},
): (
  request: CheckInConditionStaffRequest,
  credential?: StaffSessionContext,
) => Promise<CompleteCheckInConditionResult> {
  return async (request, credential) => {
    const normalized = normalizeStaffRequest(request);
    if (options.photoPreflight && !credential) throw new UnauthorizedException();
    const trusted = await options.photoPreflight?.(normalized);
    return inTransaction(pool, async (transaction) => {
      if (credential) {
        if (credential.userId !== normalized.authenticatedUserId ||
            !await lockAndRecheckStaffSessionContext(transaction, credential))
          throw new UnauthorizedException();
      }
      const { actorMembershipId, session } = await authorizeAndLockSession(
        transaction,
        normalized,
        true,
      );
      const guard = await evaluateLockedCheckInConditionGuard(
        transaction,
        {
          locationId: session.location_id,
          organizationId: session.organization_id,
          valetSessionId: session.valet_session_id,
        },
        trusted,
      );
      if (
        guard.markerComplete &&
        guard.completedAt !== null &&
        guard.completedByMembershipId !== null
      ) {
        return {
          completedAt: guard.completedAt,
          completedByMembershipId: guard.completedByMembershipId,
          valetSessionId: session.valet_session_id,
        };
      }
      requireCheckingIn(session);
      if (guard.photoPolicy.required && !guard.qualifyingPhotoPresent) {
        throw new CheckInConditionCommandError(
          "CHECK_IN_CONDITION_PHOTO_REQUIRED",
        );
      }
      const operationTime = await serverTime(transaction);
      const completionResult = await transaction.query<{
        check_in_condition_completed_at: Date;
        check_in_condition_completed_by_membership_id: string;
      }>(
        `UPDATE valet_sessions
         SET check_in_condition_completed_at = $2,
             check_in_condition_completed_by_membership_id = $3,
             updated_at = $2
         WHERE id = $1
           AND state = 'CHECKING_IN'
           AND check_in_condition_completed_at IS NULL
           AND check_in_condition_completed_by_membership_id IS NULL
         RETURNING check_in_condition_completed_at,
                   check_in_condition_completed_by_membership_id::text`,
        [session.valet_session_id, operationTime, actorMembershipId],
      );
      const completed = completionResult.rows[0];
      if (completed === undefined) {
        throw new CustodyMutationError("INVALID_STATE_TRANSITION");
      }
      await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: "VALET_SESSION_CHECK_IN_CONDITION_COMPLETED",
            metadata: {
              effectivePhotosRequired: guard.photoPolicy.required,
              policySource: guard.photoPolicy.source,
              qualifyingPhotoPresent: guard.qualifyingPhotoPresent,
            },
          },
          occurredAt: operationTime,
          scope: {
            actorMembershipId,
            locationId: session.location_id,
            organizationId: session.organization_id,
            valetSessionId: session.valet_session_id,
          },
        },
        options.auditEventIdFactory ?? randomUUID,
      );
      return {
        completedAt: completed.check_in_condition_completed_at,
        completedByMembershipId:
          completed.check_in_condition_completed_by_membership_id,
        valetSessionId: session.valet_session_id,
      };
    });
  };
}
