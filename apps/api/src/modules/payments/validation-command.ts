import { randomUUID } from "node:crypto";

import type { ValidationMutationRequest } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { AuthoritativeFinancialContext } from "./payment-types";
import { appendFinancialMutationAudit } from "./payment-mutation-audit";
import { FinancialMutationError } from "./payment-mutation-errors";
import { assertCollectionNotStarted } from "./payment-mutation-guards";
import { formatMoney, parseMoney } from "./payment-money";
import {
  insertValidation,
  lockValidationHistory,
  projectMutation,
  updatePaymentTerms,
} from "./payment-mutation-repository";
import { recomputePayment } from "./payment-recompute";
import type {
  FinancialActor,
  MutablePayment,
  PaymentMutationProjection,
  ValidationMode,
  ValidationProjection,
} from "./payment-mutation-types";

function desiredValidation(
  request: ValidationMutationRequest,
  payment: MutablePayment,
): { readonly amount: string; readonly mode: ValidationMode } {
  const service = parseMoney(payment.serviceAmount, true);
  if (request.mode === "FULL") {
    if (service === 0n)
      throw new FinancialMutationError("PAYMENT_VALIDATION_INVALID");
    return { amount: formatMoney(service), mode: "FULL" };
  }
  if (request.mode === "NONE") return { amount: "0.000", mode: "NONE" };
  const partial = parseMoney(request.amount);
  if (partial <= 0n || partial >= service) {
    throw new FinancialMutationError("PAYMENT_VALIDATION_INVALID");
  }
  return { amount: formatMoney(partial), mode: "PARTIAL" };
}

export async function mutateValidation(
  transaction: PostgresTransaction,
  input: {
    actor: FinancialActor;
    auditIdFactory?: () => string;
    operationTime: Date;
    payment: MutablePayment;
    policy: AuthoritativeFinancialContext["policy"];
    request: ValidationMutationRequest;
    validationIdFactory?: () => string;
  },
): Promise<PaymentMutationProjection> {
  if (!input.policy.validationEnabled) {
    throw new FinancialMutationError("PAYMENT_VALIDATION_DISABLED");
  }
  if (input.payment.servicePayer !== "CUSTOMER") {
    throw new FinancialMutationError("PAYMENT_VALIDATION_NOT_ALLOWED");
  }
  const history = await lockValidationHistory(transaction, input.payment);
  const current = history.find((row) => row.isCurrent) ?? null;
  const desired = desiredValidation(input.request, input.payment);
  if (current?.mode === desired.mode && current.amount === desired.amount) {
    return projectMutation(input.payment, current);
  }
  if (desired.mode === "NONE" && current === null) {
    throw new FinancialMutationError("PAYMENT_VALIDATION_INVALID");
  }
  await assertCollectionNotStarted(transaction, input.payment);
  const pending: ValidationProjection = {
    amount: desired.amount,
    id: (input.validationIdFactory ?? randomUUID)(),
    isCurrent: true,
    mode: desired.mode,
    supersedesValidationId: current?.id ?? null,
  };
  const recomputed = recomputePayment({
    currentValidation: pending,
    policy: input.policy,
    serviceAmount: input.payment.serviceAmount,
    servicePayer: input.payment.servicePayer,
    tipAmount: input.payment.tipAmount,
  });
  const validation = await insertValidation(transaction, {
    ...pending,
    membershipId: input.actor.membershipId!,
    operationTime: input.operationTime,
    payment: input.payment,
    supersedes: current,
  });
  const payment = await updatePaymentTerms(transaction, {
    operationTime: input.operationTime,
    payment: input.payment,
    recomputed,
  });
  const eventType =
    desired.mode === "NONE"
      ? "VALIDATION_REMOVED"
      : current === null
        ? "VALIDATION_APPLIED"
        : "VALIDATION_REPLACED";
  await appendFinancialMutationAudit(transaction, {
    actor: input.actor,
    entityId: validation.id,
    entityType: "Validation",
    eventType,
    idFactory: input.auditIdFactory,
    metadata: {
      amount_due_after: payment.amountDue,
      amount_due_before: input.payment.amountDue,
      collection_method_after: payment.collectionMethod,
      collection_method_before: input.payment.collectionMethod,
      status_after: payment.status,
      status_before: input.payment.status,
      superseded_validation_id: current?.id ?? null,
      validation_amount: validation.amount,
      validation_id: validation.id,
      validation_mode: validation.mode,
    },
    operationTime: input.operationTime,
    payment,
  });
  return projectMutation(payment, validation);
}
