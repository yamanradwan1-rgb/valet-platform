import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  AuthoritativeFinancialContext,
  PaymentServicePayer,
} from "./payment-types";
import { appendFinancialMutationAudit } from "./payment-mutation-audit";
import { FinancialMutationError } from "./payment-mutation-errors";
import { assertCollectionNotStarted } from "./payment-mutation-guards";
import { formatMoney, parseCurrencyMoney } from "./payment-money";
import {
  lockValidationHistory,
  projectMutation,
  updatePaymentTerms,
} from "./payment-mutation-repository";
import { recomputePayment } from "./payment-recompute";
import type {
  FinancialActor,
  MutablePayment,
  PaymentMutationProjection,
} from "./payment-mutation-types";

interface TermContext {
  readonly actor: FinancialActor;
  readonly auditIdFactory?: () => string;
  readonly operationTime: Date;
  readonly payment: MutablePayment;
  readonly policy: AuthoritativeFinancialContext["policy"];
}

export async function mutateTip(
  transaction: PostgresTransaction,
  input: TermContext & { readonly tipAmount: string },
): Promise<PaymentMutationProjection> {
  if (!input.policy.tipsEnabled) {
    throw new FinancialMutationError("PAYMENT_TIPS_DISABLED");
  }
  const history = await lockValidationHistory(transaction, input.payment);
  const current = history.find((row) => row.isCurrent) ?? null;
  await assertCollectionNotStarted(transaction, input.payment);
  const tipAmount = formatMoney(
    parseCurrencyMoney(input.tipAmount, input.payment.currency),
  );
  if (tipAmount === input.payment.tipAmount) {
    return projectMutation(input.payment, current);
  }
  const recomputed = recomputePayment({
    currentValidation: current,
    policy: input.policy,
    serviceAmount: input.payment.serviceAmount,
    servicePayer: input.payment.servicePayer,
    tipAmount,
  });
  const payment = await updatePaymentTerms(transaction, {
    operationTime: input.operationTime,
    payment: input.payment,
    recomputed,
    tipAmount,
  });
  await appendFinancialMutationAudit(transaction, {
    actor: input.actor,
    eventType: "PAYMENT_TIP_UPDATED",
    idFactory: input.auditIdFactory,
    metadata: {
      amount_due_after: payment.amountDue,
      amount_due_before: input.payment.amountDue,
      collection_method_after: payment.collectionMethod,
      collection_method_before: input.payment.collectionMethod,
      status_after: payment.status,
      status_before: input.payment.status,
      tip_amount_after: payment.tipAmount,
      tip_amount_before: input.payment.tipAmount,
    },
    operationTime: input.operationTime,
    payment,
  });
  return projectMutation(payment, current);
}

export async function correctPayer(
  transaction: PostgresTransaction,
  input: TermContext & { readonly servicePayer: PaymentServicePayer },
): Promise<PaymentMutationProjection> {
  const history = await lockValidationHistory(transaction, input.payment);
  await assertCollectionNotStarted(transaction, input.payment);
  if (history.length > 0) {
    throw new FinancialMutationError("PRECOLLECTION_CORRECTION_NOT_ALLOWED");
  }
  if (input.servicePayer === input.payment.servicePayer) {
    return projectMutation(input.payment, null);
  }
  const recomputed = recomputePayment({
    currentValidation: null,
    policy: input.policy,
    serviceAmount: input.payment.serviceAmount,
    servicePayer: input.servicePayer,
    tipAmount: input.payment.tipAmount,
  });
  const payment = await updatePaymentTerms(transaction, {
    operationTime: input.operationTime,
    payment: input.payment,
    recomputed,
    servicePayer: input.servicePayer,
  });
  await appendFinancialMutationAudit(transaction, {
    actor: input.actor,
    eventType: "PAYMENT_PAYER_CORRECTED",
    idFactory: input.auditIdFactory,
    metadata: {
      amount_due_after: payment.amountDue,
      amount_due_before: input.payment.amountDue,
      service_payer_after: payment.servicePayer,
      service_payer_before: input.payment.servicePayer,
      status_after: payment.status,
      status_before: input.payment.status,
    },
    operationTime: input.operationTime,
    payment,
  });
  return projectMutation(payment, null);
}

export async function correctServiceAmount(
  transaction: PostgresTransaction,
  input: TermContext & { readonly serviceAmount: string },
): Promise<PaymentMutationProjection> {
  const history = await lockValidationHistory(transaction, input.payment);
  await assertCollectionNotStarted(transaction, input.payment);
  if (history.length > 0) {
    throw new FinancialMutationError("PRECOLLECTION_CORRECTION_NOT_ALLOWED");
  }
  const serviceAmount = formatMoney(
    parseCurrencyMoney(input.serviceAmount, input.payment.currency),
  );
  if (serviceAmount === input.payment.serviceAmount) {
    return projectMutation(input.payment, null);
  }
  const recomputed = recomputePayment({
    currentValidation: null,
    policy: input.policy,
    serviceAmount,
    servicePayer: input.payment.servicePayer,
    tipAmount: input.payment.tipAmount,
  });
  const payment = await updatePaymentTerms(transaction, {
    operationTime: input.operationTime,
    payment: input.payment,
    recomputed,
    serviceAmount,
  });
  await appendFinancialMutationAudit(transaction, {
    actor: input.actor,
    eventType: "PAYMENT_SERVICE_AMOUNT_CORRECTED",
    idFactory: input.auditIdFactory,
    metadata: {
      amount_due_after: payment.amountDue,
      amount_due_before: input.payment.amountDue,
      service_amount_after: payment.serviceAmount,
      service_amount_before: input.payment.serviceAmount,
      status_after: payment.status,
      status_before: input.payment.status,
    },
    operationTime: input.operationTime,
    payment,
  });
  return projectMutation(payment, null);
}
