import type { PostgresPool } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { appendDispatchEvent } from "../dispatch/dispatch-event-writer";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { recordKeyReleased } from "../keys/parking-key-custody";
import { assertFinancialReleaseSatisfied } from "../payments/financial-release-guard";
import { appendCompleteHandoffAudit } from "./complete-handoff-audit";
import { CompleteHandoffError } from "./complete-handoff-errors";
import { assertCompleteHandoffLifecycle } from "./complete-handoff-guards";
import {
  authorizeCompleteHandoffOwner,
  lockCompleteHandoffRequest,
  lockCompleteHandoffSession,
  lockCompleteHandoffTask,
  lockReleaseCustody,
  resolveCompleteHandoffActor,
} from "./complete-handoff-locks";
import {
  completeHandoffSession,
  completeRetrievalRequest,
  completeRetrievalTask,
  consumeReleaseVerification,
} from "./complete-handoff-mutations";
import type { CompleteHandoffResult } from "./complete-handoff-types";
import { lockReleaseEligibleHandoffVerification } from "./handoff-release-guard";
import { assertPostTakeoverRetrievalCustodyEvidence } from "./handoff-takeover-proof-guard";

export interface CompleteHandoffCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly sessionId: string;
}

export interface CompleteHandoffCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly custodyEventIdFactory?: () => string;
  readonly dispatchEventIdFactory?: () => string;
}

export function createCompleteHandoffExecutor(
  pool: PostgresPool,
  options: CompleteHandoffCommandOptions = {},
) {
  return (
    input: CompleteHandoffCommandRequest,
  ): Promise<CompleteHandoffResult> =>
    inDispatchTransaction(pool, async (transaction) => {
      const session = await lockCompleteHandoffSession(
        transaction,
        input.sessionId,
      );
      await lockManagementSettingsOrganization(
        transaction,
        session.organization_id,
        "SHARED",
      );
      const actorMembershipId = await resolveCompleteHandoffActor(
        transaction,
        session,
        input.authenticatedUserId,
      );
      const task = await lockCompleteHandoffTask(transaction, session);
      await authorizeCompleteHandoffOwner(
        transaction,
        session,
        task,
        actorMembershipId,
      );
      const request = await lockCompleteHandoffRequest(transaction, session);
      assertCompleteHandoffLifecycle(
        session,
        task,
        request,
        input.expectedSessionVersion,
      );
      const operationTime = await loadDispatchOperationTime(transaction);
      await assertFinancialReleaseSatisfied(transaction, session);
      const verification = await lockReleaseEligibleHandoffVerification(
        transaction,
        session,
        operationTime,
        actorMembershipId,
      );
      if (verification === undefined) {
        throw new CompleteHandoffError("HANDOFF_VERIFICATION_FAILED");
      }
      const keySlotId = await lockReleaseCustody(transaction, session);
      await assertPostTakeoverRetrievalCustodyEvidence(
        transaction,
        {
          organizationId: session.organization_id,
          locationId: session.location_id,
          sessionId: session.id,
          taskId: task.id,
          keySlotId,
          currentAssigneeMembershipId: actorMembershipId,
        },
        () => {
          throw new CompleteHandoffError("KEY_CUSTODY_NOT_READY");
        },
      );

      await consumeReleaseVerification(
        transaction,
        verification.id,
        operationTime,
      );
      await completeRetrievalRequest(transaction, request, session);
      const taskVersion = await completeRetrievalTask(
        transaction,
        task,
        actorMembershipId,
        operationTime,
      );
      await recordKeyReleased(
        transaction,
        {
          actorMembershipId,
          keySlotId,
          locationId: session.location_id,
          occurredAt: operationTime,
          organizationId: session.organization_id,
          sessionId: session.id,
        },
        options.custodyEventIdFactory,
      );
      await appendDispatchEvent(
        transaction,
        {
          actorMembershipId,
          eventType: "COMPLETED",
          newAssigneeMembershipId: actorMembershipId,
          occurredAt: operationTime,
          previousAssigneeMembershipId: null,
          reason: null,
          task,
        },
        options.dispatchEventIdFactory,
      );
      const sessionVersion = await completeHandoffSession(
        transaction,
        session,
        actorMembershipId,
        keySlotId,
        operationTime,
      );
      await appendCompleteHandoffAudit(
        transaction,
        {
          actorMembershipId,
          keySlotId,
          operationTime,
          request,
          session,
          sessionVersion,
          task,
          taskVersion,
          verification,
        },
        options.auditEventIdFactory,
      );
      return {
        retrievalRequestStatus: "COMPLETED",
        sessionId: session.id,
        sessionVersion,
        state: "COMPLETED",
        taskId: task.id,
        taskStatus: "COMPLETED",
        taskVersion,
      };
    });
}
