import { FinancialMutationError } from "./payment-mutation-errors";
import { addMoney, formatMoney, parseMoney } from "./payment-money";
import type {
  MutationPolicy,
  RecomputedPayment,
  ValidationProjection,
} from "./payment-mutation-types";
import type { PaymentServicePayer } from "./payment-types";

export function recomputePayment(input: {
  readonly currentValidation: ValidationProjection | null;
  readonly policy: MutationPolicy;
  readonly serviceAmount: string;
  readonly servicePayer: PaymentServicePayer;
  readonly tipAmount: string;
}): RecomputedPayment {
  const service = parseMoney(input.serviceAmount, true);
  const tip = parseMoney(input.tipAmount, true);
  const validation =
    input.currentValidation === null || input.currentValidation.mode === "NONE"
      ? 0n
      : parseMoney(input.currentValidation.amount, true);
  if (validation > service) {
    throw new FinancialMutationError("PAYMENT_VALIDATION_INVALID");
  }
  const customerServiceDue =
    input.servicePayer === "CUSTOMER" ? service - validation : 0n;
  const amountDue = addMoney(customerServiceDue, tip);
  const formatted = formatMoney(amountDue);
  if (amountDue === 0n) {
    return {
      amountDue: formatted,
      collectionMethod: "NONE",
      status: "NOT_REQUIRED",
    };
  }
  if (input.policy.paymentMethodsPolicy === "DIGITAL_ONLY") {
    throw new FinancialMutationError("DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE");
  }
  return { amountDue: formatted, collectionMethod: "CASH", status: "UNPAID" };
}
