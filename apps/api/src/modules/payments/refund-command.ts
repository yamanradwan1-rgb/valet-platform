import { randomUUID } from "node:crypto";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { appendRefundAudit } from "./refund-audit";
import { RefundError } from "./refund-errors";
import { authorizeManagerFinancialMutation } from "./payment-authorization";
import { lockCanonicalPayment } from "./payment-mutation-repository";
import type { MutablePayment } from "./payment-mutation-types";
import {
  inPaymentTransaction,
  loadPaymentOperationTime,
} from "./payment-transaction";
import {
  findRefundByIdempotencyKey,
  insertRefund,
  projectRefund,
  refundableExposure,
} from "./refund-repository";
import type {
  PersistedRefund,
  RefundCommandRequest,
  RefundProjection,
} from "./refund-types";
import {
  formatRefundMoney,
  normalizeRefundReason,
  parseRefundMoney,
  requireRepresentableRefund,
  validateRefundRequest,
} from "./refund-validation";
import { normalizeProviderIdentifier } from "./digital-collection-validation";

interface RefundCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly refundIdFactory?: () => string;
}

function isSafeHistoricalReference(value: string | null): value is string {
  return (
    value !== null &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= 400 &&
    [...value].every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
  );
}

function requireCollectedPayment(payment: MutablePayment): void {
  const amountDue = parseRefundMoney(payment.amountDue, true);
  const amountPaid = parseRefundMoney(payment.amountPaid, true);
  const cash =
    payment.collectionMethod === "CASH" &&
    payment.provider === null &&
    payment.providerReference === null;
  const digital =
    payment.collectionMethod === "DIGITAL" &&
    payment.provider !== null &&
    normalizeProviderIdentifier(payment.provider) === payment.provider &&
    isSafeHistoricalReference(payment.providerReference);
  if (
    payment.status !== "PAID" ||
    payment.paidAt === null ||
    amountPaid <= 0n ||
    amountPaid !== amountDue ||
    (!cash && !digital)
  ) {
    throw new RefundError("REFUND_NOT_ALLOWED");
  }
}

function isSameRequest(
  existing: PersistedRefund,
  input: {
    amount: string;
    membershipId: string;
    paymentId: string;
    reason: string;
  },
): boolean {
  return (
    parseRefundMoney(existing.amount, true) ===
      parseRefundMoney(input.amount, true) &&
    existing.authorizedByMembershipId === input.membershipId &&
    existing.paymentId === input.paymentId &&
    existing.reason === input.reason
  );
}

function resolveExisting(
  existing: PersistedRefund,
  input: {
    amount: string;
    membershipId: string;
    paymentId: string;
    reason: string;
  },
): RefundProjection {
  if (!isSameRequest(existing, input)) {
    throw new RefundError("REFUND_IDEMPOTENCY_CONFLICT");
  }
  return projectRefund(existing);
}

async function insertWithRaceResolution(
  transaction: PostgresTransaction,
  input: Parameters<typeof insertRefund>[1],
): Promise<PersistedRefund | null> {
  await transaction.query("SAVEPOINT refund_insert");
  try {
    const refund = await insertRefund(transaction, input);
    await transaction.query("RELEASE SAVEPOINT refund_insert");
    return refund;
  } catch (error) {
    const postgres = error as { code?: unknown; constraint?: unknown };
    await transaction.query("ROLLBACK TO SAVEPOINT refund_insert");
    await transaction.query("RELEASE SAVEPOINT refund_insert");
    if (
      postgres.code === "23505" &&
      postgres.constraint === "refunds_organization_id_idempotency_key"
    ) {
      return null;
    }
    throw error;
  }
}

export function createRefundExecutor(
  pool: PostgresPool,
  options: RefundCommandOptions = {},
) {
  return (request: RefundCommandRequest): Promise<RefundProjection> => {
    validateRefundRequest(request);
    const reason = normalizeRefundReason(request.reason);
    return inPaymentTransaction(pool, async (transaction) => {
      const authorization = await authorizeManagerFinancialMutation(
        transaction,
        request.authenticatedUserId,
        request.valetSessionId,
      );
      const payment = await lockCanonicalPayment(
        transaction,
        authorization.scope,
      );
      const membershipId = authorization.actor.membershipId;
      if (membershipId === null) throw new RefundError("REFUND_NOT_ALLOWED");
      const amountMills = requireRepresentableRefund(
        request.amount,
        payment.currency,
      );
      const amount = formatRefundMoney(amountMills);
      const identity = {
        amount,
        membershipId,
        paymentId: payment.id,
        reason,
      };
      const existing = await findRefundByIdempotencyKey(
        transaction,
        payment.organizationId,
        request.idempotencyKey,
        payment.currency,
      );
      if (existing !== null) return resolveExisting(existing, identity);

      requireCollectedPayment(payment);
      const exposure = parseRefundMoney(
        await refundableExposure(transaction, payment),
        true,
      );
      const paid = parseRefundMoney(payment.amountPaid, true);
      if (exposure > paid || amountMills > paid - exposure) {
        throw new RefundError("REFUND_NOT_ALLOWED");
      }
      const operationTime = await loadPaymentOperationTime(transaction);
      const status =
        payment.collectionMethod === "CASH" ? "SUCCEEDED" : "PENDING";
      const insertInput = {
        amount,
        authorizedByMembershipId: membershipId,
        completedAt: status === "SUCCEEDED" ? operationTime : null,
        currency: payment.currency,
        id: options.refundIdFactory?.() ?? randomUUID(),
        idempotencyKey: request.idempotencyKey,
        operationTime,
        organizationId: payment.organizationId,
        paymentId: payment.id,
        provider: status === "PENDING" ? payment.provider : null,
        reason,
        status,
      } as const;
      const refund = await insertWithRaceResolution(transaction, insertInput);
      if (refund === null) {
        const winner = await findRefundByIdempotencyKey(
          transaction,
          payment.organizationId,
          request.idempotencyKey,
          payment.currency,
        );
        if (winner === null) throw new RefundError("REFUND_NOT_ALLOWED");
        return resolveExisting(winner, identity);
      }
      await appendRefundAudit(transaction, {
        idFactory: options.auditEventIdFactory,
        payment,
        refund,
      });
      return projectRefund(refund);
    });
  };
}
