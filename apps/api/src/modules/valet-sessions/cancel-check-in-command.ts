import type {
  CancelCheckInRequest,
  CancelCheckInResponse,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import { CustodyMutationError } from "./protected-custody-command";
import {
  authorizeAndLockCancelTarget,
  assertCoherentCancellation,
  type CancelCheckInAuthorityInput,
} from "./cancel-check-in-authorization";

export function createCancelCheckInCommandExecutor(
  pool: PostgresPool,
  options: { auditEventIdFactory?: () => string } = {},
) {
  return (
    input: CancelCheckInAuthorityInput & CancelCheckInRequest,
  ): Promise<CancelCheckInResponse> =>
    inPostgresTransaction(pool, async (transaction) => {
      const { actor, session } = await authorizeAndLockCancelTarget(
        transaction,
        input,
      );
      const result = {
        sessionId: session.id,
        locationId: session.location_id,
        state: "CANCELLED" as const,
        version: session.version,
      };
      if (session.state === "CANCELLED") {
        await assertCoherentCancellation(transaction, session);
        return result;
      }
      if (session.version !== input.expectedVersion)
        throw new CustodyMutationError("VERSION_CONFLICT");
      if (session.state !== "CHECKING_IN" || !session.intake_only)
        throw new CustodyMutationError("INVALID_STATE_TRANSITION");
      const tasks = await transaction.query<{ present: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM tasks WHERE organization_id = $2
          AND location_id = $3 AND valet_session_id = $1) AS present`,
        [session.id, session.organization_id, session.location_id],
      );
      if (tasks.rows[0]?.present !== false)
        throw new CustodyMutationError("INVALID_STATE_TRANSITION");
      const time = await transaction.query<{ at: Date }>(
        "SELECT clock_timestamp() AS at",
      );
      const at = time.rows[0]?.at;
      if (!at) throw new Error("Database operation time is unavailable.");
      const updated = await transaction.query<{ version: number }>(
        `UPDATE valet_sessions SET state = 'CANCELLED', version = version + 1,
           updated_at = $5 WHERE id = $1 AND organization_id = $2
           AND location_id = $3 AND state = 'CHECKING_IN' AND version = $4
         RETURNING version`,
        [
          session.id,
          session.organization_id,
          session.location_id,
          input.expectedVersion,
          at,
        ],
      );
      const version = updated.rows[0]?.version;
      if (version === undefined)
        throw new CustodyMutationError("VERSION_CONFLICT");
      await appendCustodyAuditEvent(
        transaction,
        {
          definition: {
            eventType: "VALET_SESSION_CHECK_IN_CANCELLED",
            metadata: {
              fromState: "CHECKING_IN",
              toState: "CANCELLED",
              fromVersion: session.version,
              toVersion: version,
            },
          },
          occurredAt: at,
          scope: {
            actorMembershipId: actor.membershipId,
            organizationId: session.organization_id,
            locationId: session.location_id,
            valetSessionId: session.id,
          },
        },
        options.auditEventIdFactory,
      );
      return { ...result, version };
    });
}
