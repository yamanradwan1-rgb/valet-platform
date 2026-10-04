import { UnauthorizedException } from "@nestjs/common";

import type { PostgresTransaction } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import type { StaffSessionContext } from "../auth/staff-session-context";
import type { ShiftPresenceEvidence } from "@valet/contracts";
import { ShiftOperationError } from "./shift-errors";
import { ShiftPresenceError } from "./shift-presence-errors";

export async function recheckPresenceShiftSession(
  transaction: PostgresTransaction,
  context?: StaffSessionContext,
) {
  if (
    context !== undefined &&
    (await lockAndRecheckStaffSessionContext(transaction, context)) ===
      undefined
  ) {
    throw new UnauthorizedException();
  }
}

/** Read target relationships only; this preliminary read never grants authority. */
export async function guardPresenceShiftIntent(
  transaction: PostgresTransaction,
  input: {
    authenticatedUserId: string;
    targetLocationId?: string;
    shiftId?: string;
    sessionContext?: StaffSessionContext;
    presence?: ShiftPresenceEvidence;
    protectExceptionAuthority?: boolean;
  },
) {
  const target =
    input.shiftId === undefined
      ? await transaction.query<{
          organization_id: string;
          location_id: string;
        }>(
          `SELECT organization_id::text,id::text AS location_id FROM locations WHERE id=$1`,
          [input.targetLocationId],
        )
      : await transaction.query<{
          organization_id: string;
          location_id: string;
        }>(
          `SELECT s.organization_id::text,s.location_id::text FROM shifts s
       JOIN organization_memberships m ON m.organization_id=s.organization_id AND m.id=s.membership_id
       WHERE s.id=$1 AND m.user_id=$2`,
          [input.shiftId, input.authenticatedUserId],
        );
  const scope = target.rows[0];
  if (scope === undefined)
    throw new ShiftOperationError("TENANT_ACCESS_DENIED");
  await lockManagementSettingsOrganization(
    transaction,
    scope.organization_id,
    "SHARED",
  );
  await lockLocationLifecycle(transaction, scope.location_id, "SHARED");
  if (input.sessionContext !== undefined) {
    if (
      input.sessionContext.userId !== input.authenticatedUserId ||
      (await lockAndRecheckStaffSessionContext(
        transaction,
        input.sessionContext,
      )) === undefined
    ) {
      throw new UnauthorizedException();
    }
  }
  // Do not wait on an invalidator after holding actor session/User locks.
  if (
    input.presence?.kind === "EXCEPTION" ||
    input.protectExceptionAuthority === true
  ) {
    const guard = await transaction.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_xact_lock_shared(hashtextextended('staff-management-org:'||$1::text,0)) AS acquired`,
      [scope.organization_id],
    );
    if (guard.rows[0]?.acquired !== true)
      throw new ShiftPresenceError("PRESENCE_AUTHORITY_BUSY");
  }
  return {
    organizationId: scope.organization_id,
    locationId: scope.location_id,
  };
}

/** Deployment-managed keyed digest; never generate an ephemeral key for retained attempts. */
export function presenceFingerprintKey(injected?: Uint8Array): Uint8Array {
  if (injected !== undefined && injected.byteLength >= 32) return injected;
  const encoded = process.env.SHIFT_PRESENCE_FINGERPRINT_KEY;
  if (encoded === undefined || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new ShiftPresenceError("PRESENCE_SECURITY_UNAVAILABLE");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength < 32 || key.toString("base64") !== encoded) {
    throw new ShiftPresenceError("PRESENCE_SECURITY_UNAVAILABLE");
  }
  return key;
}

/** Previous deployment keys are retained until their 90-day tombstones are purged. */
export function presenceFingerprintKeys(
  injected?: Uint8Array,
): readonly Uint8Array[] {
  const current = presenceFingerprintKey(injected);
  if (injected !== undefined) return [current];
  const encoded = process.env.SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS;
  if (encoded === undefined) return [current];
  try {
    const previous: unknown = JSON.parse(encoded);
    if (!Array.isArray(previous) || previous.length > 16) throw new Error();
    const keys = previous.map((value: unknown) => {
      if (typeof value !== "string") throw new Error();
      const key = Buffer.from(value, "base64");
      if (key.byteLength < 32 || key.toString("base64") !== value)
        throw new Error();
      return key;
    });
    return [current, ...keys];
  } catch {
    throw new ShiftPresenceError("PRESENCE_SECURITY_UNAVAILABLE");
  }
}

export function presenceDatabaseError(error: unknown): unknown {
  const database = error as {
    code?: string;
    constraint?: string;
    message?: string;
  };
  if (database.code === "55P03" || database.code === "40P01") {
    return new ShiftPresenceError("PRESENCE_AUTHORITY_BUSY");
  }
  if (database.code === "42501")
    return new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
  if (
    database.code === "23514" &&
    (database.constraint?.startsWith("shift_presence") === true ||
      database.message?.startsWith("Presence") === true)
  ) {
    return new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  }
  return error;
}
