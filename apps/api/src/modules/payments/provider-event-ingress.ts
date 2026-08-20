import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import {
  inPaymentTransaction,
  loadPaymentOperationTime,
} from "./payment-transaction";
import { appendProviderEventAudit } from "./provider-event-audit";
import { reconcileCollectionEvent } from "./provider-event-collection";
import { ProviderEventError } from "./provider-event-errors";
import { reconcileRefundEvent } from "./provider-event-refund";
import {
  findCommittedProviderEvent,
  insertProviderEvent,
} from "./provider-event-repository";
import type {
  AuthenticatedProviderEvent,
  ProviderEventAuthenticator,
  ProviderEventIngress,
  ProviderEventProcessingResult,
  ProviderEventProcessorOptions,
} from "./provider-event-types";
import { validateAuthenticatedProviderEvent } from "./provider-event-validation";

export type ProviderEventIngressOptions = ProviderEventProcessorOptions;

interface PostgresError extends Error {
  readonly code?: string;
  readonly constraint?: string;
}

async function readDuplicate(
  pool: PostgresPool,
  event: AuthenticatedProviderEvent,
): Promise<ProviderEventProcessingResult | null> {
  return await inPaymentTransaction(pool, (transaction) =>
    findCommittedProviderEvent(transaction, event),
  );
}

async function processFirstSeen(
  pool: PostgresPool,
  authenticated: AuthenticatedProviderEvent,
  options: ProviderEventProcessorOptions,
): Promise<ProviderEventProcessingResult> {
  return await inPaymentTransaction(pool, async (transaction) => {
    const duplicate = await findCommittedProviderEvent(
      transaction,
      authenticated,
    );
    if (duplicate !== null) return duplicate;
    const operationTime = await loadPaymentOperationTime(transaction);
    const decision =
      authenticated.event.subject === "COLLECTION"
        ? await reconcileCollectionEvent(transaction, {
            authenticated,
            event: authenticated.event,
            operationTime,
          })
        : await reconcileRefundEvent(transaction, {
            authenticated,
            event: authenticated.event,
            operationTime,
          });
    if (decision.payment === null || decision.paymentId === null) {
      return {
        duplicate: false,
        eventId: null,
        persisted: false,
        processingStatus: "IGNORED",
      };
    }
    const eventId = options.eventIdFactory?.() ?? randomUUID();
    const processingStatus = decision.authoritative ? "PROCESSED" : "IGNORED";
    await insertProviderEvent(transaction, {
      event: authenticated,
      eventId,
      operationTime,
      paymentId: decision.paymentId,
      processingStatus,
      refundId:
        authenticated.event.subject === "REFUND"
          ? authenticated.event.refundId
          : null,
    });
    if (decision.authoritative && decision.subjectId !== null) {
      await appendProviderEventAudit(transaction, {
        event: authenticated,
        idFactory: options.auditEventIdFactory,
        operationTime,
        payment: decision.payment,
        subjectId: decision.subjectId,
      });
    }
    return {
      duplicate: false,
      eventId,
      persisted: true,
      processingStatus,
    };
  });
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const postgresError = error as PostgresError;
  return (
    postgresError.code === "23505" && postgresError.constraint === constraint
  );
}

function isProviderReferenceCollision(error: unknown): boolean {
  return [
    "payment_collection_operations_org_provider_reference_key",
    "payments_organization_id_provider_provider_reference_key",
    "refunds_organization_id_provider_provider_reference_key",
  ].some((constraint) => isUniqueViolation(error, constraint));
}

async function processWithReferenceCollisionRetry(
  pool: PostgresPool,
  event: AuthenticatedProviderEvent,
  options: ProviderEventProcessorOptions,
): Promise<ProviderEventProcessingResult> {
  try {
    return await processFirstSeen(pool, event, options);
  } catch (error) {
    if (isProviderReferenceCollision(error)) {
      return await processFirstSeen(pool, event, options);
    }
    throw error;
  }
}

export function createProviderEventIngress(
  pool: PostgresPool,
  authenticator: ProviderEventAuthenticator,
  options: ProviderEventIngressOptions = {},
): ProviderEventIngress {
  return async (raw) => {
    let candidate: unknown;
    try {
      candidate = await authenticator.authenticateAndNormalize(raw);
    } catch {
      throw new ProviderEventError("PROVIDER_EVENT_REJECTED");
    }
    const event = validateAuthenticatedProviderEvent(candidate);
    try {
      return await processWithReferenceCollisionRetry(pool, event, options);
    } catch (error) {
      if (
        isUniqueViolation(
          error,
          "payment_provider_events_org_provider_event_id_key",
        )
      ) {
        const duplicate = await readDuplicate(pool, event);
        if (duplicate !== null) return duplicate;
      }
      throw new ProviderEventError("PROVIDER_EVENT_PROCESSING_FAILED");
    }
  };
}
