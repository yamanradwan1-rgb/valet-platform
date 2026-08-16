import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import { isCurrencyAmountRepresentable } from "../../common/financial/currency-minor-units";
import { appendCashMutationAudit } from "./cash-audit";
import {
  authorizeCashMutation,
  lockRequiredOperationalShift,
} from "./cash-authorization";
import { CashMutationError } from "./cash-errors";
import { formatCashMoney, parseCashMoney } from "./cash-money";
import {
  cashEntryNet,
  findCashEntryBySubmissionKey,
  insertCashEntry,
  lockAttributableActiveShift,
  projectCashMutation,
  updatePaymentCashProjection,
  type PersistedCashEntry,
} from "./cash-repository";
import type {
  CashAdjustmentCommandRequest,
  CashMutationProjection,
  CashReceiptCommandRequest,
} from "./cash-types";
import { lockCanonicalPayment } from "./payment-mutation-repository";
import type { MutablePayment } from "./payment-mutation-types";
import {
  inPaymentTransaction,
  loadPaymentOperationTime,
} from "./payment-transaction";

interface CashCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly cashEntryIdFactory?: () => string;
}

function requireCashPayment(payment: MutablePayment): bigint {
  const amountDue = parseCashMoney(payment.amountDue, true);
  if (
    amountDue <= 0n ||
    payment.collectionMethod !== "CASH" ||
    payment.provider !== null ||
    payment.providerReference !== null
  ) {
    throw new CashMutationError("CASH_COLLECTION_NOT_ALLOWED");
  }
  return amountDue;
}

function sameEntry(
  existing: PersistedCashEntry,
  input: {
    actorMembershipId: string;
    amount: string;
    paymentId: string;
    reason: string | null;
    type: PersistedCashEntry["type"];
  },
): boolean {
  return (
    existing.actorMembershipId === input.actorMembershipId &&
    parseCashMoney(existing.amount, true) === parseCashMoney(input.amount) &&
    existing.paymentId === input.paymentId &&
    existing.reason === input.reason &&
    existing.type === input.type
  );
}

function retryProjection(
  payment: MutablePayment,
  existing: PersistedCashEntry,
): CashMutationProjection {
  if (payment.status !== "PAID" && payment.status !== "UNPAID") {
    throw new CashMutationError("CASH_COLLECTION_NOT_ALLOWED");
  }
  return projectCashMutation(payment, existing, {
    amountPaid: payment.amountPaid,
    status: payment.status,
  });
}

function translateInsertError(error: unknown): never {
  const postgres = error as { code?: unknown; constraint?: unknown };
  if (
    postgres.code === "23505" &&
    (postgres.constraint ===
      "cash_entries_organization_id_submission_idempotency_key" ||
      postgres.constraint === "cash_entries_one_receipt_per_payment_idx")
  ) {
    throw new CashMutationError("CASH_IDEMPOTENCY_CONFLICT");
  }
  throw error;
}

export function createCashReceiptExecutor(
  pool: PostgresPool,
  options: CashCommandOptions = {},
) {
  return (request: CashReceiptCommandRequest) =>
    inPaymentTransaction(pool, async (transaction) => {
      const authorization = await authorizeCashMutation(
        transaction,
        request.authenticatedUserId,
        request.valetSessionId,
      );
      const payment = await lockCanonicalPayment(
        transaction,
        authorization.scope,
      );
      const amountDue = requireCashPayment(payment);
      const amount = formatCashMoney(amountDue);
      const existing = await findCashEntryBySubmissionKey(
        transaction,
        payment.organizationId,
        request.submissionIdempotencyKey,
      );
      if (existing !== null) {
        if (
          !sameEntry(existing, {
            actorMembershipId: authorization.actor.membershipId,
            amount,
            paymentId: payment.id,
            reason: null,
            type: "RECEIPT",
          })
        ) {
          throw new CashMutationError("CASH_IDEMPOTENCY_CONFLICT");
        }
        return retryProjection(payment, existing);
      }
      if (
        payment.status !== "UNPAID" ||
        parseCashMoney(payment.amountPaid, true) !== 0n ||
        payment.paidAt !== null
      ) {
        throw new CashMutationError("CASH_COLLECTION_NOT_ALLOWED");
      }
      await lockRequiredOperationalShift(transaction, authorization);
      const operationTime = await loadPaymentOperationTime(transaction);
      let entry: PersistedCashEntry;
      try {
        entry = await insertCashEntry(transaction, {
          actorMembershipId: authorization.actor.membershipId,
          amount,
          id: (options.cashEntryIdFactory ?? randomUUID)(),
          operationTime,
          organizationId: payment.organizationId,
          paymentId: payment.id,
          reason: null,
          submissionIdempotencyKey: request.submissionIdempotencyKey,
          type: "RECEIPT",
        });
      } catch (error) {
        translateInsertError(error);
      }
      const current = await updatePaymentCashProjection(transaction, {
        amountPaid: amount,
        operationTime,
        payment,
        status: "PAID",
      });
      await appendCashMutationAudit(transaction, {
        actor: authorization.actor,
        amountPaid: current.amountPaid,
        entry,
        idFactory: options.auditEventIdFactory,
        payment,
        status: current.status,
      });
      return projectCashMutation(payment, entry, current);
    });
}

export function createCashAdjustmentExecutor(
  pool: PostgresPool,
  options: CashCommandOptions = {},
) {
  return (request: CashAdjustmentCommandRequest) =>
    inPaymentTransaction(pool, async (transaction) => {
      const authorization = await authorizeCashMutation(
        transaction,
        request.authenticatedUserId,
        request.valetSessionId,
        true,
      );
      const payment = await lockCanonicalPayment(
        transaction,
        authorization.scope,
      );
      const amountDue = requireCashPayment(payment);
      const amountMills = parseCashMoney(request.amount);
      if (!isCurrencyAmountRepresentable(payment.currency, amountMills)) {
        throw new CashMutationError("PAYMENT_AMOUNT_INVALID");
      }
      const amount = formatCashMoney(amountMills);
      const reason = request.reason.trim();
      if (amountMills <= 0n || reason.length === 0 || reason.length > 500) {
        throw new CashMutationError("CASH_ADJUSTMENT_NOT_ALLOWED");
      }
      const existing = await findCashEntryBySubmissionKey(
        transaction,
        payment.organizationId,
        request.submissionIdempotencyKey,
      );
      if (existing !== null) {
        if (
          !sameEntry(existing, {
            actorMembershipId: authorization.actor.membershipId,
            amount,
            paymentId: payment.id,
            reason,
            type: request.entryType,
          })
        ) {
          throw new CashMutationError("CASH_IDEMPOTENCY_CONFLICT");
        }
        return retryProjection(payment, existing);
      }
      const recorded = await cashEntryNet(transaction, payment);
      const currentNet = parseCashMoney(recorded.net, true);
      if (
        !recorded.hasReceipt ||
        currentNet !== parseCashMoney(payment.amountPaid, true)
      ) {
        throw new CashMutationError("CASH_ADJUSTMENT_NOT_ALLOWED");
      }
      const nextNet =
        request.entryType === "ADJUSTMENT_INCREASE"
          ? currentNet + amountMills
          : currentNet - amountMills;
      if (nextNet < 0n || nextNet > amountDue) {
        throw new CashMutationError("CASH_ADJUSTMENT_NOT_ALLOWED");
      }
      await lockAttributableActiveShift(transaction, payment);
      const operationTime = await loadPaymentOperationTime(transaction);
      let entry: PersistedCashEntry;
      try {
        entry = await insertCashEntry(transaction, {
          actorMembershipId: authorization.actor.membershipId,
          amount,
          id: (options.cashEntryIdFactory ?? randomUUID)(),
          operationTime,
          organizationId: payment.organizationId,
          paymentId: payment.id,
          reason,
          submissionIdempotencyKey: request.submissionIdempotencyKey,
          type: request.entryType,
        });
      } catch (error) {
        translateInsertError(error);
      }
      const status = nextNet === amountDue ? "PAID" : "UNPAID";
      const current = await updatePaymentCashProjection(transaction, {
        amountPaid: formatCashMoney(nextNet),
        operationTime,
        payment,
        status,
      });
      await appendCashMutationAudit(transaction, {
        actor: authorization.actor,
        amountPaid: current.amountPaid,
        entry,
        idFactory: options.auditEventIdFactory,
        payment,
        status: current.status,
      });
      return projectCashMutation(payment, entry, current);
    });
}
