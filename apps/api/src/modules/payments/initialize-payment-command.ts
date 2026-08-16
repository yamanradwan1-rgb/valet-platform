import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import { isCurrencyAmountRepresentable } from "../../common/financial/currency-minor-units";
import { resolveEffectiveFinancialPolicy } from "./financial-policy-resolver";
import { appendPaymentInitializedAudit } from "./payment-audit";
import { PaymentInitializationError } from "./payment-errors";
import { parseMoney } from "./payment-money";
import {
  assertCreationKeyAvailableForSession,
  findCanonicalPayment,
  insertCanonicalPayment,
  lockPaymentSessionScope,
} from "./payment-repository";
import {
  inPaymentTransaction,
  loadPaymentOperationTime,
} from "./payment-transaction";
import type {
  InitializePaymentRequest,
  PaymentCollectionMethod,
  PaymentProjection,
  PaymentStatus,
} from "./payment-types";

export interface InitializePaymentOptions {
  readonly auditEventIdFactory?: () => string;
  readonly paymentIdFactory?: () => string;
}

interface InitialPaymentState {
  readonly amountDue: string;
  readonly collectionMethod: PaymentCollectionMethod;
  readonly status: PaymentStatus;
}

interface PostgresConstraintError extends Error {
  readonly code?: string;
  readonly constraint?: string;
}

function validateRequest(request: InitializePaymentRequest): void {
  if (
    request.valetSessionId.trim() === "" ||
    request.creationIdempotencyKey.trim() === ""
  ) {
    throw new PaymentInitializationError("PAYMENT_INITIALIZATION_INVALID");
  }
}

function isZeroMoney(value: string): boolean {
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error("Persisted financial policy amount is invalid.");
  }
  return /^0+(?:\.0+)?$/.test(value);
}

function deriveInitialState(
  serviceAmount: string,
  servicePayer: "CUSTOMER" | "VENUE",
  paymentMethodsPolicy: "CASH_ONLY" | "DIGITAL_ONLY" | "CASH_OR_DIGITAL",
): InitialPaymentState {
  const amountDue = servicePayer === "CUSTOMER" ? serviceAmount : "0.000";
  if (isZeroMoney(amountDue)) {
    return {
      amountDue,
      collectionMethod: "NONE",
      status: "NOT_REQUIRED",
    };
  }
  if (paymentMethodsPolicy === "DIGITAL_ONLY") {
    throw new PaymentInitializationError(
      "DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE",
    );
  }
  return { amountDue, collectionMethod: "CASH", status: "UNPAID" };
}

function translateConstraintError(error: unknown): never {
  const postgresError = error as PostgresConstraintError;
  if (
    postgresError.code === "23505" &&
    postgresError.constraint ===
      "payments_organization_id_creation_idempotency_key"
  ) {
    throw new PaymentInitializationError(
      "PAYMENT_CREATION_IDEMPOTENCY_CONFLICT",
    );
  }
  throw error;
}

export function createInitializePaymentExecutor(
  pool: PostgresPool,
  options: InitializePaymentOptions = {},
): (request: InitializePaymentRequest) => Promise<PaymentProjection> {
  const paymentIdFactory = options.paymentIdFactory ?? randomUUID;
  return async (request) => {
    validateRequest(request);
    try {
      return await inPaymentTransaction(pool, async (transaction) => {
        const scope = await lockPaymentSessionScope(
          transaction,
          request.valetSessionId,
        );
        const context = await resolveEffectiveFinancialPolicy(
          transaction,
          scope,
        );
        await assertCreationKeyAvailableForSession(
          transaction,
          scope,
          request.creationIdempotencyKey,
        );
        const existing = await findCanonicalPayment(transaction, scope);
        if (existing !== null) return existing;

        const serviceAmountMills = parseMoney(
          context.policy.valetServiceFee,
          true,
        );
        if (
          !isCurrencyAmountRepresentable(
            context.currency,
            serviceAmountMills,
          )
        ) {
          throw new PaymentInitializationError("PAYMENT_INITIALIZATION_INVALID");
        }

        const initial = deriveInitialState(
          context.policy.valetServiceFee,
          context.policy.servicePayer,
          context.policy.paymentMethodsPolicy,
        );
        const operationTime = await loadPaymentOperationTime(transaction);
        const payment = await insertCanonicalPayment(transaction, {
          ...initial,
          creationIdempotencyKey: request.creationIdempotencyKey,
          currency: context.currency,
          id: paymentIdFactory(),
          operationTime,
          scope,
          serviceAmount: context.policy.valetServiceFee,
          servicePayer: context.policy.servicePayer,
        });
        await appendPaymentInitializedAudit(
          transaction,
          payment,
          operationTime,
          options.auditEventIdFactory,
        );
        return payment;
      });
    } catch (error) {
      translateConstraintError(error);
    }
  };
}
