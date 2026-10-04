import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type {
  ShiftPresenceChallengeIntent,
  ShiftPresenceOperation,
} from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { inShiftTransaction } from "./shift-transaction";
import { authorizePresenceOperationalScope } from "./shift-presence-operational-scope";
import { allocatePresenceChallenge } from "./shift-presence-challenge";
import { resolvePresenceOperation } from "./shift-presence-attempt";
import { ShiftPresenceError } from "./shift-presence-errors";
import {
  presenceOperationResultProjection,
  presenceExceptionProjection,
} from "./shift-presence-result-projection";
import { requestPresenceException } from "./shift-presence-exception";
import { lockShiftPresenceConfiguration } from "./shift-presence-policy";
import type { PresenceOperationRow } from "./shift-presence-operation";
import { ShiftOperationError } from "./shift-errors";
import { parseShiftMoney } from "./shift-money";
import { isCurrencyAmountRepresentable } from "../../common/financial/currency-minor-units";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { presenceDatabaseError } from "./shift-presence-security";
import { authorizePresenceResultScope } from "./shift-presence-query-scope";

function operationInput(row: PresenceOperationRow): ShiftPresenceOperation {
  const scope = {
    userId: row.user_id,
    organizationId: row.organization_id,
    locationId: row.location_id,
    membershipId: row.membership_id,
    operationId: row.operation_id,
    targetFingerprint: row.target_fingerprint,
  };
  return row.action === "START"
    ? { ...scope, action: "START", shiftId: null }
    : { ...scope, action: "END", shiftId: row.shift_id! };
}

@Injectable()
export class ShiftPresenceService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  private run<T>(
    context: StaffSessionContext,
    operation: (tx: PostgresTransaction) => Promise<T>,
  ) {
    return inShiftTransaction(this.pool, async (tx) => {
      const result = await operation(tx);
      if ((await lockAndRecheckStaffSessionContext(tx, context)) === undefined)
        throw new UnauthorizedException();
      return result;
    }).catch((error) => {
      throw presenceDatabaseError(error);
    });
  }

  issue(context: StaffSessionContext, intent: ShiftPresenceChallengeIntent) {
    return this.run(context, async (tx) => {
      const scope = await authorizePresenceOperationalScope(
        tx,
        context,
        intent,
      );
      if (
        intent.action === "END" &&
        (!("currency" in scope) ||
          !isCurrencyAmountRepresentable(
            scope.currency!,
            parseShiftMoney(intent.cashReported),
          ))
      ) {
        throw new ShiftOperationError("SHIFT_CASH_REPORT_INVALID");
      }
      if (
        intent.action === "END" &&
        "status" in scope &&
        scope.status !== "ACTIVE"
      ) {
        throw new ShiftPresenceError("PRESENCE_OPERATION_EXPIRED");
      }
      const { operation } = await resolvePresenceOperation(
        tx,
        {
          organizationId: scope.organizationId,
          locationId: scope.locationId,
          membershipId: scope.membershipId,
          userId: context.userId,
          action: intent.action,
          shiftId: intent.action === "END" ? intent.shiftId : null,
          cashReported: intent.action === "END" ? intent.cashReported : null,
        },
        intent.operationId,
      );
      const challenge = await allocatePresenceChallenge(tx, operation);
      return {
        operationId: intent.operationId,
        challengeId: challenge.id,
        action: intent.action,
        locationId: scope.locationId,
        shiftId: operation.shiftId,
        issuedAt: challenge.issued_at.toISOString(),
        expiresAt: challenge.expires_at.toISOString(),
      };
    });
  }

  private async ownedOperation(
    tx: PostgresTransaction,
    context: StaffSessionContext,
    operationId: string,
  ) {
    const found = await tx.query<PresenceOperationRow>(
      `SELECT * FROM shift_presence_operations WHERE user_id=$1 AND operation_id=$2`,
      [context.userId, operationId],
    );
    const row = found.rows[0];
    if (row === undefined) return undefined;
    const scope = await authorizePresenceResultScope(tx, context, row);
    if (
      scope.membershipId !== row.membership_id ||
      scope.organizationId !== row.organization_id ||
      scope.locationId !== row.location_id
    ) {
      throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
    }
    const current = await tx.query<PresenceOperationRow>(
      `SELECT * FROM shift_presence_operations
      WHERE user_id=$1 AND operation_id=$2 FOR UPDATE`,
      [context.userId, operationId],
    );
    return current.rows[0];
  }

  status(context: StaffSessionContext, operationId: string) {
    return this.run(context, async (tx) => {
      const row = await this.ownedOperation(tx, context, operationId);
      if (row === undefined) {
        // Authenticate even an absent/foreign selector; no mutation replay or existence disclosure.
        if (
          (await lockAndRecheckStaffSessionContext(tx, context)) === undefined
        )
          throw new UnauthorizedException();
        return { operationId, state: "EXPIRED" };
      }
      return presenceOperationResultProjection(tx, row);
    });
  }

  challenge(context: StaffSessionContext, operationId: string) {
    return this.run(context, async (tx) => {
      const row = await this.ownedOperation(tx, context, operationId);
      if (row === undefined || row.status !== "PENDING")
        throw new ShiftPresenceError("PRESENCE_OPERATION_EXPIRED");
      const found = await tx.query(
        `SELECT id,issued_at,expires_at,consumed_at FROM shift_presence_challenges
        WHERE operation_row_id=$1 AND expires_at>clock_timestamp()`,
        [row.id],
      );
      const challenge = found.rows[0];
      if (challenge === undefined || challenge.consumed_at !== null)
        throw new ShiftPresenceError("PRESENCE_CHALLENGE_EXPIRED");
      return {
        operationId,
        challengeId: challenge.id,
        action: row.action,
        locationId: row.location_id,
        shiftId: row.shift_id,
        issuedAt: challenge.issued_at.toISOString(),
        expiresAt: challenge.expires_at.toISOString(),
      };
    });
  }

  requestException(
    context: StaffSessionContext,
    operationId: string,
    command: { challengeId: string; reason: string },
  ) {
    return this.run(context, async (tx) => {
      const row = await this.ownedOperation(tx, context, operationId);
      if (row === undefined)
        throw new ShiftPresenceError("PRESENCE_OPERATION_EXPIRED");
      const configuration = await lockShiftPresenceConfiguration(tx, {
        organizationId: row.organization_id,
        locationId: row.location_id,
      });
      const mode =
        row.action === "START"
          ? configuration.policy.startMode
          : configuration.policy.endMode;
      if (mode !== "REQUIRE_OR_OVERRIDE")
        throw new ShiftPresenceError("PRESENCE_REJECTED");
      const challenge = await tx.query(
        `SELECT id FROM shift_presence_challenges WHERE operation_row_id=$1`,
        [row.id],
      );
      if (challenge.rows[0]?.id !== command.challengeId)
        throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
      const exception = await requestPresenceException(
        tx,
        operationInput(row),
        command.reason,
      );
      const persisted = await tx.query(
        `SELECT * FROM shift_presence_exceptions WHERE id=$1`,
        [exception.id],
      );
      return presenceExceptionProjection(persisted.rows[0]!);
    });
  }

  exception(context: StaffSessionContext, exceptionId: string) {
    return this.run(context, async (tx) => {
      const result = await tx.query(
        `SELECT * FROM shift_presence_exceptions WHERE id=$1 AND user_id=$2`,
        [exceptionId, context.userId],
      );
      const row = result.rows[0];
      if (row === undefined)
        throw new ShiftOperationError("AUTHORIZATION_DENIED");
      const scope = await authorizePresenceResultScope(
        tx,
        context,
        row as Parameters<typeof authorizePresenceResultScope>[2],
      );
      if (
        scope.membershipId !== row.membership_id ||
        scope.organizationId !== row.organization_id ||
        scope.locationId !== row.location_id
      ) {
        throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
      }
      const current = await tx.query(
        `SELECT * FROM shift_presence_exceptions WHERE id=$1 AND user_id=$2`,
        [exceptionId, context.userId],
      );
      if (current.rows[0] === undefined)
        throw new ShiftOperationError("AUTHORIZATION_DENIED");
      return presenceExceptionProjection(current.rows[0]);
    });
  }
}
