import { randomUUID } from "node:crypto";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { isCurrencyAmountRepresentable } from "../../common/financial/currency-minor-units";
import { resolveEffectiveFinancialPolicy } from "./financial-policy-resolver";
import { appendDigitalCollectionAudit } from "./digital-collection-audit";
import { DigitalCollectionError } from "./digital-collection-errors";
import {
  findOperationBySubmissionKey,
  findUnresolvedOperation,
  hasExternalCollectionEvidence,
  insertPreparedOperation,
  lockDigitalCollectionPayment,
  projectPreparedPayment,
} from "./digital-collection-repository";
import {
  attachDigitalCollectionReference,
  guardDigitalCollectionDispatch,
  rejectDigitalCollection,
} from "./digital-collection-transitions";
import {
  normalizeDigitalCollectionResult,
  resolveConfiguredProvider,
  resolveDigitalProvider,
  validateDigitalCollectionRequest,
} from "./digital-collection-validation";
import type {
  DigitalCollectionOperation,
  DigitalCollectionPayment,
  InitiateDigitalCollectionRequest,
} from "./digital-collection-types";
import type {
  DigitalCollectionInitiationResult,
  DigitalPaymentProviderRegistry,
} from "./digital-payment-provider";
import { parseMoney } from "./payment-money";
import {
  inPaymentTransaction,
  loadPaymentOperationTime,
} from "./payment-transaction";

export interface DigitalCollectionExecutorOptions {
  readonly auditEventIdFactory?: () => string;
  readonly operationIdFactory?: () => string;
}

interface PreparedResult {
  readonly operation: DigitalCollectionOperation;
  readonly payment: DigitalCollectionPayment;
}

function assertExistingCompatible(
  operation: DigitalCollectionOperation,
  payment: DigitalCollectionPayment,
): void {
  if (
    operation.paymentId !== payment.id ||
    operation.currency !== payment.currency ||
    parseMoney(operation.amount, true) !== parseMoney(payment.amountDue, true)
  ) {
    throw new DigitalCollectionError("DIGITAL_COLLECTION_IDEMPOTENCY_CONFLICT");
  }
}

async function assertFreshEligible(
  transaction: PostgresTransaction,
  payment: DigitalCollectionPayment,
): Promise<void> {
  const policy = (await resolveEffectiveFinancialPolicy(transaction, payment))
    .policy;
  const amount = parseMoney(payment.amountDue, true);
  if (
    payment.status !== "UNPAID" ||
    parseMoney(payment.amountPaid, true) !== 0n ||
    amount <= 0n ||
    !["DIGITAL_ONLY", "CASH_OR_DIGITAL"].includes(
      policy.paymentMethodsPolicy,
    ) ||
    (await hasExternalCollectionEvidence(transaction, payment)) ||
    !isCurrencyAmountRepresentable(payment.currency, amount)
  ) {
    throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
  }
}

async function prepareOperation(
  transaction: PostgresTransaction,
  request: InitiateDigitalCollectionRequest,
  registry: DigitalPaymentProviderRegistry,
  options: DigitalCollectionExecutorOptions,
): Promise<PreparedResult> {
  const payment = await lockDigitalCollectionPayment(
    transaction,
    request.valetSessionId,
  );
  if (payment === null) {
    throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
  }
  const existing = await findOperationBySubmissionKey(
    transaction,
    payment.organizationId,
    request.submissionIdempotencyKey,
  );
  if (existing !== null) {
    assertExistingCompatible(existing, payment);
    return { operation: existing, payment };
  }
  await assertFreshEligible(transaction, payment);
  const configured = resolveConfiguredProvider(registry, {
    locationId: payment.locationId,
    organizationId: payment.organizationId,
    paymentId: payment.id,
  });
  if (configured === null) {
    throw new DigitalCollectionError("DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE");
  }
  if (resolveDigitalProvider(registry, configured) === null) {
    throw new DigitalCollectionError("DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE");
  }
  if ((await findUnresolvedOperation(transaction, payment)) !== null) {
    throw new DigitalCollectionError(
      "DIGITAL_COLLECTION_OPERATION_IN_PROGRESS",
    );
  }
  const operationTime = await loadPaymentOperationTime(transaction);
  const inserted = await insertPreparedOperation(transaction, {
    id: options.operationIdFactory?.() ?? randomUUID(),
    operationTime,
    payment,
    provider: configured,
    submissionKey: request.submissionIdempotencyKey,
  });
  if (inserted === null) {
    const winner = await findOperationBySubmissionKey(
      transaction,
      payment.organizationId,
      request.submissionIdempotencyKey,
    );
    if (winner !== null) {
      assertExistingCompatible(winner, payment);
      return { operation: winner, payment };
    }
    if ((await findUnresolvedOperation(transaction, payment)) !== null) {
      throw new DigitalCollectionError(
        "DIGITAL_COLLECTION_OPERATION_IN_PROGRESS",
      );
    }
    throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
  }
  if (
    !(await projectPreparedPayment(
      transaction,
      payment,
      configured,
      operationTime,
    ))
  ) {
    throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
  }
  await appendDigitalCollectionAudit(transaction, {
    eventType: "PAYMENT_COLLECTION_PREPARED",
    idFactory: options.auditEventIdFactory,
    operation: inserted,
    operationTime,
    payment,
  });
  return {
    operation: inserted,
    payment: {
      ...payment,
      collectionMethod: "DIGITAL",
      provider: configured,
      providerReference: null,
    },
  };
}

async function fenceDispatch(
  pool: PostgresPool,
  prepared: PreparedResult,
  options: DigitalCollectionExecutorOptions,
) {
  return await inPaymentTransaction(pool, async (transaction) => {
    const operationTime = await loadPaymentOperationTime(transaction);
    const guarded = await guardDigitalCollectionDispatch(transaction, {
      operation: prepared.operation,
      operationTime,
    });
    if (guarded.won) {
      await appendDigitalCollectionAudit(transaction, {
        eventType: "PAYMENT_COLLECTION_DISPATCH_GUARDED",
        idFactory: options.auditEventIdFactory,
        operation: guarded.operation,
        operationTime,
        payment: prepared.payment,
      });
    }
    return guarded;
  });
}

async function persistResult(
  pool: PostgresPool,
  prepared: PreparedResult,
  operation: DigitalCollectionOperation,
  result: DigitalCollectionInitiationResult,
  options: DigitalCollectionExecutorOptions,
): Promise<DigitalCollectionOperation> {
  if (result.kind === "OUTCOME_UNKNOWN") return operation;
  if (
    result.kind === "REFERENCE_ATTACHED" &&
    result.providerReference.trim() === ""
  ) {
    return operation;
  }
  return await inPaymentTransaction(pool, async (transaction) => {
    const operationTime = await loadPaymentOperationTime(transaction);
    const updated =
      result.kind === "REFERENCE_ATTACHED"
        ? await attachDigitalCollectionReference(transaction, {
            operation,
            operationTime,
            payment: prepared.payment,
            providerReference: result.providerReference.trim(),
            safeResultCode: result.safeResultCode,
          })
        : await rejectDigitalCollection(transaction, {
            operation,
            operationTime,
            safeResultCode: result.safeResultCode,
          });
    await appendDigitalCollectionAudit(transaction, {
      eventType:
        result.kind === "REFERENCE_ATTACHED"
          ? "PAYMENT_COLLECTION_REFERENCE_ATTACHED"
          : "PAYMENT_COLLECTION_REJECTED",
      idFactory: options.auditEventIdFactory,
      operation: updated,
      operationTime,
      payment: prepared.payment,
    });
    return updated;
  });
}

export function createDigitalCollectionExecutor(
  pool: PostgresPool,
  registry: DigitalPaymentProviderRegistry,
  options: DigitalCollectionExecutorOptions = {},
) {
  return async (
    request: InitiateDigitalCollectionRequest,
  ): Promise<DigitalCollectionOperation> => {
    validateDigitalCollectionRequest(request);
    const prepared = await inPaymentTransaction(pool, (transaction) =>
      prepareOperation(transaction, request, registry, options),
    );
    if (prepared.operation.state !== "PREPARED") return prepared.operation;
    const provider = resolveDigitalProvider(
      registry,
      prepared.operation.provider,
    );
    if (provider === null) return prepared.operation;
    const guarded = await fenceDispatch(pool, prepared, options);
    if (!guarded.won) return guarded.operation;
    let result: DigitalCollectionInitiationResult;
    try {
      result = normalizeDigitalCollectionResult(
        await provider.initiateCollection({
          amount: guarded.operation.amount,
          currency: guarded.operation.currency,
          operationId: guarded.operation.id,
        }),
      );
    } catch {
      return guarded.operation;
    }
    try {
      return await persistResult(
        pool,
        prepared,
        guarded.operation,
        result,
        options,
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
      }
      throw error;
    }
  };
}
