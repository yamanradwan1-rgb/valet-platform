import { randomUUID } from "node:crypto";

import {
  createDigitalCollectionExecutor,
  type DigitalCollectionExecutorOptions,
} from "../src/modules/payments/digital-collection-command";
import type {
  DigitalCollectionInitiationInput,
  DigitalCollectionInitiationResult,
  DigitalPaymentProviderPort,
  DigitalPaymentProviderRegistry,
} from "../src/modules/payments/digital-payment-provider";
import {
  FinancialMutationTestContext,
  type FinancialActorFixture,
} from "./financial-mutation-test-context";
import type { PaymentFixture } from "./payment-test-context";

export class TestDigitalProvider implements DigitalPaymentProviderPort {
  readonly calls: DigitalCollectionInitiationInput[] = [];
  handler: (
    input: DigitalCollectionInitiationInput,
  ) => Promise<DigitalCollectionInitiationResult> = async () => ({
    kind: "OUTCOME_UNKNOWN",
    safeResultCode: null,
  });

  async initiateCollection(input: DigitalCollectionInitiationInput) {
    this.calls.push(input);
    return await this.handler(input);
  }
}

export class TestDigitalProviderRegistry implements DigitalPaymentProviderRegistry {
  configuredProvider: string | null = "provider-a";
  readonly adapters = new Map<string, DigitalPaymentProviderPort>();

  configuredProviderFor(): string | null {
    return this.configuredProvider;
  }

  providerFor(provider: string): DigitalPaymentProviderPort | null {
    return this.adapters.get(provider) ?? null;
  }
}

export class DigitalCollectionTestContext extends FinancialMutationTestContext {
  constructor(label: string) {
    super(`008d_${label}`);
  }

  async fixture(currency = "JOD"): Promise<PaymentFixture> {
    const fixture = await this.createPaymentFixture({
      currency,
      organizationFee: "5.000",
      organizationMethods: "CASH_OR_DIGITAL",
    });
    await this.initialize(fixture);
    return fixture;
  }

  collect(
    fixture: PaymentFixture,
    submissionIdempotencyKey: string,
    registry: DigitalPaymentProviderRegistry,
    options: DigitalCollectionExecutorOptions = {},
  ) {
    return createDigitalCollectionExecutor(
      this.runtimePool,
      registry,
      options,
    )({
      submissionIdempotencyKey,
      valetSessionId: fixture.sessionId,
    });
  }

  async collectionEffects(fixture: PaymentFixture) {
    const payment = await this.payment(fixture.sessionId);
    const operations = await this.adminPool.query(
      `SELECT id::text, organization_id::text, payment_id::text,
              submission_idempotency_key, amount::text, currency, provider,
              state::text, provider_reference, safe_result_code,
              dispatch_guarded_at, resolved_at, created_at, updated_at
       FROM payment_collection_operations
       WHERE payment_id = $1 ORDER BY created_at, id`,
      [payment.id],
    );
    const audits = await this.adminPool.query(
      `SELECT event_type, entity_type, entity_id::text,
              actor_membership_id::text, metadata_json
       FROM audit_events
       WHERE valet_session_id = $1
         AND event_type LIKE 'PAYMENT_COLLECTION_%'
       ORDER BY occurred_at, id`,
      [fixture.sessionId],
    );
    return { audits: audits.rows, operations: operations.rows, payment };
  }

  async insertPrepared(
    fixture: PaymentFixture,
    provider = "provider-a",
    submissionIdempotencyKey = randomUUID(),
  ) {
    const payment = await this.payment(fixture.sessionId);
    const operationId = randomUUID();
    await this.adminPool.query(
      `UPDATE payments SET collection_method = 'DIGITAL', provider = $2,
           provider_reference = NULL, updated_at = transaction_timestamp()
       WHERE id = $1`,
      [payment.id, provider],
    );
    await this.adminPool.query(
      `INSERT INTO payment_collection_operations
         (id, organization_id, payment_id, submission_idempotency_key,
          amount, currency, provider, state, updated_at)
       VALUES ($2, $3, $1, $4, $5::numeric, $6, $7, 'PREPARED',
               transaction_timestamp())`,
      [
        payment.id,
        operationId,
        fixture.organizationId,
        submissionIdempotencyKey,
        payment.amount_due,
        payment.currency,
        provider,
      ],
    );
    return { operationId, submissionIdempotencyKey };
  }

  async terminalize(
    operationId: string,
    state: "REJECTED" | "RESOLVED",
  ): Promise<void> {
    await this.adminPool.query(
      `UPDATE payment_collection_operations
       SET state = $2::payment_collection_operation_state,
           provider_reference = CASE WHEN $2::text = 'RESOLVED' THEN $3 ELSE NULL END,
           dispatch_guarded_at = transaction_timestamp(),
           resolved_at = transaction_timestamp(), updated_at = transaction_timestamp()
       WHERE id = $1`,
      [operationId, state, randomUUID()],
    );
  }

  serviceCorrection(
    fixture: PaymentFixture,
    actor: FinancialActorFixture,
    serviceAmount = "6.000",
  ) {
    return this.serviceAmount(fixture, actor, { serviceAmount });
  }
}

export async function expectDigitalError(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected digital collection error ${code}.`);
  } catch (error) {
    if ((error as { code?: string }).code !== code) throw error;
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
