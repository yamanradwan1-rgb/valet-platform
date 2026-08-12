import type { PostgresPool } from "../../common/database/postgres";
import { appendKeyAuditEvent } from "./key-audit-event-writer";
import {
  assertKeyCommandGuards,
  mutateCurrentKeySlot,
  validateExpectedVersion,
} from "./key-command-guards";
import { appendKeyCustodyEvent } from "./key-custody-event-writer";
import { lockAuthorizedKeySession } from "./key-session-authorization";
import { inKeyTransaction, loadKeyOperationTime } from "./key-transaction";
import type { KeyAssignmentResult } from "./key-types";

export interface ClearKeySlotCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedVersion: number;
  readonly sessionId: string;
}

interface ClearKeySlotCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly custodyEventIdFactory?: () => string;
}

export function createClearKeySlotCommandExecutor(
  pool: PostgresPool,
  options: ClearKeySlotCommandOptions = {},
): (request: ClearKeySlotCommandRequest) => Promise<KeyAssignmentResult> {
  return async (request) => {
    validateExpectedVersion(request.expectedVersion);
    return inKeyTransaction(pool, async (transaction) => {
      const session = await lockAuthorizedKeySession(transaction, request);
      assertKeyCommandGuards(session, request.expectedVersion);
      if (session.key_slot_id === null) {
        return {
          keySlotCode: null,
          sessionId: session.session_id,
          state: "AWAITING_PARKING",
          version: session.version,
        };
      }

      const operationTime = await loadKeyOperationTime(transaction);
      const nextVersion = await mutateCurrentKeySlot(transaction, {
        expectedVersion: request.expectedVersion,
        keySlotId: null,
        operationTime,
        sessionId: session.session_id,
      });
      const eventScope = {
        actorMembershipId: session.actorMembershipId,
        locationId: session.location_id,
        occurredAt: operationTime,
        organizationId: session.organization_id,
        sessionId: session.session_id,
      };
      await appendKeyCustodyEvent(
        transaction,
        {
          ...eventScope,
          eventType: "SLOT_CLEARED",
          keySlotId: session.key_slot_id,
        },
        options.custodyEventIdFactory,
      );
      await appendKeyAuditEvent(
        transaction,
        {
          ...eventScope,
          currentKeySlotId: null,
          eventType: "VALET_SESSION_KEY_SLOT_CLEARED",
          fromVersion: session.version,
          previousKeySlotId: session.key_slot_id,
          toVersion: nextVersion,
        },
        options.auditEventIdFactory,
      );
      return {
        keySlotCode: null,
        sessionId: session.session_id,
        state: "AWAITING_PARKING",
        version: nextVersion,
      };
    });
  };
}
