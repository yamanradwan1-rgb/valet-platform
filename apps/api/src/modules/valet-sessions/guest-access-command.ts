import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { DatabaseError } from "pg";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import {
  authorizeCustodyActorForPersistedScope,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "../staff/custody-staff-authorizer";

export const guestAccessContract = {
  hashPrefix: "sha256:v1:",
  lifetimeMilliseconds: 24 * 60 * 60 * 1_000,
  rawTokenCharacters: 43,
  tokenEntropyBytes: 32,
} as const;

export type GuestAccessErrorCode =
  | "GUEST_ACCESS_GENERATION_FAILED"
  | "GUEST_ACCESS_INVALID"
  | "GUEST_ACCESS_INTENT_CONFLICT"
  | "GUEST_ACCESS_REQUEST_INVALID";

const errorMessages: Record<GuestAccessErrorCode, string> = {
  GUEST_ACCESS_GENERATION_FAILED: "Guest access could not be generated safely.",
  GUEST_ACCESS_INVALID: "Guest access is invalid.",
  GUEST_ACCESS_INTENT_CONFLICT:
    "Guest access intent does not match the current access state.",
  GUEST_ACCESS_REQUEST_INVALID: "The guest access request is invalid.",
};

export class GuestAccessError extends Error {
  readonly code: GuestAccessErrorCode;

  constructor(code: GuestAccessErrorCode) {
    super(errorMessages[code]);
    this.name = "GuestAccessError";
    this.code = code;
  }
}

export interface StaffGuestAccessRequest {
  readonly authenticatedUserId: string;
  readonly valetSessionId: string;
}

export type GuestAccessIssueIntent = "ISSUE_OR_ROTATE" | "REISSUE_REVOKED";

export interface IssueGuestAccessRequest extends StaffGuestAccessRequest {
  readonly expectedRevokedAt?: Date;
  readonly intent?: GuestAccessIssueIntent;
}

export interface IssueGuestAccessResult {
  readonly expiresAt: Date;
  readonly issuedAt: Date;
  readonly mutationKind: "ISSUED" | "ROTATED";
  readonly rawToken: string;
  readonly valetSessionId: string;
}

export interface RevokeGuestAccessResult {
  readonly revokedAt: Date;
  readonly valetSessionId: string;
}

export interface GuestSafeVehicle {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
}

export interface GuestSafeSession {
  readonly state:
    | "AWAITING_PARKING"
    | "CHECKING_IN"
    | "COMPLETED"
    | "HANDOFF_PENDING"
    | "PARKED"
    | "PARKING"
    | "READY"
    | "REQUESTED"
    | "RETRIEVING";
  readonly valetSessionId: string;
  readonly vehicle: GuestSafeVehicle;
}

interface GuestAccessScope {
  customer_access_expires_at: Date;
  customer_access_revoked_at: Date | null;
  customer_access_token_hash: string;
  location_id: string;
  organization_id: string;
  valet_session_id: string;
}

interface GuestAccessCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly tokenBytesFactory?: () => Buffer;
}

interface GuestSafeSessionRow {
  color: string | null;
  make: string | null;
  model: string | null;
  state: GuestSafeSession["state"];
  valet_session_id: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rawTokenPattern = /^[A-Za-z0-9_-]{43}$/;

function invalidStaffRequest(): never {
  throw new GuestAccessError("GUEST_ACCESS_REQUEST_INVALID");
}

function normalizeUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    return invalidStaffRequest();
  }
  return value.toLowerCase();
}

function normalizeStaffRequest(
  request: StaffGuestAccessRequest,
): StaffGuestAccessRequest {
  if (request === null || typeof request !== "object") {
    return invalidStaffRequest();
  }
  if (
    Object.keys(request).some(
      (key) => !["authenticatedUserId", "valetSessionId"].includes(key),
    )
  ) {
    return invalidStaffRequest();
  }
  return {
    authenticatedUserId: normalizeUuid(request.authenticatedUserId),
    valetSessionId: normalizeUuid(request.valetSessionId),
  };
}

function normalizeIssueRequest(
  request: IssueGuestAccessRequest,
): StaffGuestAccessRequest & {
  expectedRevokedAt: Date | null;
  intent: GuestAccessIssueIntent;
} {
  if (request === null || typeof request !== "object") {
    return invalidStaffRequest();
  }
  if (
    Object.keys(request).some(
      (key) =>
        ![
          "authenticatedUserId",
          "expectedRevokedAt",
          "intent",
          "valetSessionId",
        ].includes(key),
    )
  ) {
    return invalidStaffRequest();
  }
  const intent = request.intent ?? "ISSUE_OR_ROTATE";
  if (intent !== "ISSUE_OR_ROTATE" && intent !== "REISSUE_REVOKED") {
    return invalidStaffRequest();
  }
  const hasExpectedRevokedAt = Object.prototype.hasOwnProperty.call(
    request,
    "expectedRevokedAt",
  );
  if (
    (intent === "ISSUE_OR_ROTATE" && hasExpectedRevokedAt) ||
    (intent === "REISSUE_REVOKED" &&
      (!hasExpectedRevokedAt ||
        !(request.expectedRevokedAt instanceof Date) ||
        !Number.isFinite(request.expectedRevokedAt.getTime())))
  ) {
    return invalidStaffRequest();
  }
  return {
    authenticatedUserId: normalizeUuid(request.authenticatedUserId),
    expectedRevokedAt: request.expectedRevokedAt ?? null,
    intent,
    valetSessionId: normalizeUuid(request.valetSessionId),
  };
}

function generateRawToken(tokenBytesFactory: () => Buffer): string {
  const entropy = tokenBytesFactory();
  if (
    !Buffer.isBuffer(entropy) ||
    entropy.length !== guestAccessContract.tokenEntropyBytes
  ) {
    throw new GuestAccessError("GUEST_ACCESS_GENERATION_FAILED");
  }
  const rawToken = entropy.toString("base64url");
  if (!rawTokenPattern.test(rawToken)) {
    throw new GuestAccessError("GUEST_ACCESS_GENERATION_FAILED");
  }
  return rawToken;
}

export function hashGuestAccessToken(rawToken: string): string {
  return `${guestAccessContract.hashPrefix}${createHash("sha256")
    .update(rawToken, "utf8")
    .digest("hex")}`;
}

function assertPresentedToken(rawToken: unknown): asserts rawToken is string {
  if (typeof rawToken !== "string" || !rawTokenPattern.test(rawToken)) {
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
}

async function loadSessionScope(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<Pick<GuestAccessScope, "location_id" | "organization_id">> {
  const result = await transaction.query<{
    location_id: string;
    organization_id: string;
  }>(
    `SELECT organization_id::text, location_id::text
     FROM valet_sessions
     WHERE id = $1`,
    [valetSessionId],
  );
  const scope = result.rows[0];
  if (scope === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return scope;
}

async function lockSessionScope(
  transaction: PostgresTransaction,
  valetSessionId: string,
  organizationId: string,
  locationId: string,
): Promise<GuestAccessScope> {
  const result = await transaction.query<GuestAccessScope>(
    `SELECT id::text AS valet_session_id, organization_id::text,
            location_id::text, customer_access_token_hash,
            customer_access_expires_at, customer_access_revoked_at
     FROM valet_sessions
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
     FOR UPDATE`,
    [valetSessionId, organizationId, locationId],
  );
  const scope = result.rows[0];
  if (scope === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return scope;
}

async function authorizeAndLockSession(
  transaction: PostgresTransaction,
  request: StaffGuestAccessRequest,
): Promise<{
  actorMembershipId: string;
  scope: GuestAccessScope;
}> {
  await requireActiveCustodyUser(transaction, request.authenticatedUserId);
  const initialScope = await loadSessionScope(
    transaction,
    request.valetSessionId,
  );
  const actor = await authorizeCustodyActorForPersistedScope(transaction, {
    allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
    authenticatedUserId: request.authenticatedUserId,
    resourceScope: {
      locationId: initialScope.location_id,
      organizationId: initialScope.organization_id,
    },
  });
  const scope = await lockSessionScope(
    transaction,
    request.valetSessionId,
    initialScope.organization_id,
    initialScope.location_id,
  );
  return { actorMembershipId: actor.membershipId, scope };
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

function isTokenHashCollision(error: unknown): boolean {
  const databaseError = error as Partial<DatabaseError>;
  return (
    databaseError.code === "23505" &&
    databaseError.constraint === "valet_sessions_customer_access_token_hash_key"
  );
}

async function rollbackPreservingError(
  transaction: PostgresTransaction,
): Promise<void> {
  try {
    await transaction.query("ROLLBACK");
  } catch {
    // Preserve the original guest-access command failure.
  }
}

export function createIssueGuestAccessCommandExecutor(
  pool: PostgresPool,
  options: GuestAccessCommandOptions = {},
): (request: IssueGuestAccessRequest) => Promise<IssueGuestAccessResult> {
  return async (request) => {
    const normalized = normalizeIssueRequest(request);
    const transaction = await pool.connect();
    try {
      await transaction.query("BEGIN");
      const { actorMembershipId, scope } = await authorizeAndLockSession(
        transaction,
        normalized,
      );
      const isDisabledPlaceholder =
        scope.customer_access_token_hash.startsWith("disabled:intake:");
      const isRevoked = scope.customer_access_revoked_at !== null;
      const expectedRevocationMatches =
        normalized.expectedRevokedAt !== null &&
        scope.customer_access_revoked_at !== null &&
        normalized.expectedRevokedAt.getTime() ===
          scope.customer_access_revoked_at.getTime();
      if (
        (normalized.intent === "ISSUE_OR_ROTATE" &&
          !isDisabledPlaceholder &&
          isRevoked) ||
        (normalized.intent === "REISSUE_REVOKED" &&
          (isDisabledPlaceholder || !isRevoked || !expectedRevocationMatches))
      ) {
        throw new GuestAccessError("GUEST_ACCESS_INTENT_CONFLICT");
      }
      const operationTime = await serverTime(transaction);
      const mutationKind = isDisabledPlaceholder ? "ISSUED" : "ROTATED";
      const rawToken = generateRawToken(
        options.tokenBytesFactory ??
          (() => randomBytes(guestAccessContract.tokenEntropyBytes)),
      );
      const tokenHash = hashGuestAccessToken(rawToken);
      if (tokenHash === scope.customer_access_token_hash) {
        throw new GuestAccessError("GUEST_ACCESS_GENERATION_FAILED");
      }
      const expiresAt = new Date(
        operationTime.getTime() + guestAccessContract.lifetimeMilliseconds,
      );
      const mutationResult = await transaction.query<{ expires_at: Date }>(
        `UPDATE valet_sessions
         SET customer_access_token_hash = $2,
             customer_access_expires_at = $4,
             customer_access_revoked_at = NULL,
             updated_at = $3
         WHERE id = $1
         RETURNING customer_access_expires_at AS expires_at`,
        [scope.valet_session_id, tokenHash, operationTime, expiresAt],
      );
      const persistedExpiresAt = mutationResult.rows[0]?.expires_at;
      if (persistedExpiresAt === undefined) {
        throw new Error("Guest-access mutation returned no session.");
      }

      await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: `GUEST_ACCESS_${mutationKind}`,
            metadata: {
              accessContractVersion: "V1",
              mutationKind,
            },
          },
          occurredAt: operationTime,
          scope: {
            actorMembershipId,
            locationId: scope.location_id,
            organizationId: scope.organization_id,
            valetSessionId: scope.valet_session_id,
          },
        },
        options.auditEventIdFactory ?? randomUUID,
      );

      await transaction.query("COMMIT");
      return {
        expiresAt: persistedExpiresAt,
        issuedAt: operationTime,
        mutationKind,
        rawToken,
        valetSessionId: scope.valet_session_id,
      };
    } catch (error) {
      await rollbackPreservingError(transaction);
      if (isTokenHashCollision(error)) {
        throw new GuestAccessError("GUEST_ACCESS_GENERATION_FAILED");
      }
      throw error;
    } finally {
      transaction.release();
    }
  };
}

export function createRevokeGuestAccessCommandExecutor(
  pool: PostgresPool,
  options: GuestAccessCommandOptions = {},
): (request: StaffGuestAccessRequest) => Promise<RevokeGuestAccessResult> {
  return async (request) => {
    const normalized = normalizeStaffRequest(request);
    const transaction = await pool.connect();
    try {
      await transaction.query("BEGIN");
      const { actorMembershipId, scope } = await authorizeAndLockSession(
        transaction,
        normalized,
      );
      if (scope.customer_access_revoked_at !== null) {
        await transaction.query("COMMIT");
        return {
          revokedAt: scope.customer_access_revoked_at,
          valetSessionId: scope.valet_session_id,
        };
      }

      const operationTime = await serverTime(transaction);
      const mutationResult = await transaction.query<{ revoked_at: Date }>(
        `UPDATE valet_sessions
         SET customer_access_revoked_at = $2,
             updated_at = $2
         WHERE id = $1
         RETURNING customer_access_revoked_at AS revoked_at`,
        [scope.valet_session_id, operationTime],
      );
      const revokedAt = mutationResult.rows[0]?.revoked_at;
      if (revokedAt === undefined) {
        throw new Error("Guest-access revocation returned no session.");
      }

      await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: "GUEST_ACCESS_REVOKED",
            metadata: {
              accessContractVersion: "V1",
              mutationKind: "REVOKED",
            },
          },
          occurredAt: operationTime,
          scope: {
            actorMembershipId,
            locationId: scope.location_id,
            organizationId: scope.organization_id,
            valetSessionId: scope.valet_session_id,
          },
        },
        options.auditEventIdFactory ?? randomUUID,
      );

      await transaction.query("COMMIT");
      return { revokedAt, valetSessionId: scope.valet_session_id };
    } catch (error) {
      await rollbackPreservingError(transaction);
      throw error;
    } finally {
      transaction.release();
    }
  };
}

export function createGuestAccessResolver(
  pool: PostgresPool,
): (rawToken: string) => Promise<GuestSafeSession> {
  return async (rawToken) => resolveGuestAccessWithDatabase(pool, rawToken);
}

export async function resolveGuestAccessWithDatabase(
  database: PostgresPool | PostgresTransaction,
  rawToken: string,
): Promise<GuestSafeSession> {
  assertPresentedToken(rawToken);
  const tokenHash = hashGuestAccessToken(rawToken);
  const result = await database.query<GuestSafeSessionRow>(
    `SELECT session.id::text AS valet_session_id, session.state::text,
              vehicle.make, vehicle.model, vehicle.color
       FROM valet_sessions AS session
       INNER JOIN vehicles AS vehicle
         ON vehicle.organization_id = session.organization_id
        AND vehicle.id = session.vehicle_id
       WHERE session.customer_access_token_hash = $1
         AND session.customer_access_revoked_at IS NULL
         AND session.customer_access_expires_at > clock_timestamp()`,
    [tokenHash],
  );
  const session = result.rows[0];
  if (session === undefined) {
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
  return {
    state: session.state,
    valetSessionId: session.valet_session_id,
    vehicle: {
      color: session.color,
      make: session.make,
      model: session.model,
    },
  };
}
