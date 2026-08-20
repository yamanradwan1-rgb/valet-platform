import { randomUUID } from "node:crypto";

import {
  createProviderEventIngress,
  type ProviderEventIngressOptions,
} from "../src/modules/payments/provider-event-ingress";
import type { ProviderEventAuthenticator } from "../src/modules/payments/provider-event-types";
import {
  DigitalCollectionTestContext,
  TestDigitalProvider,
  TestDigitalProviderRegistry,
} from "./digital-collection-test-context";
import type { PaymentFixture } from "./payment-test-context";

export class TestProviderEventAuthenticator implements ProviderEventAuthenticator {
  handler: (raw: unknown) => Promise<unknown> = async (raw) => raw;

  authenticateAndNormalize(raw: unknown): Promise<unknown> {
    return this.handler(raw);
  }
}

export class ProviderEventTestContext extends DigitalCollectionTestContext {
  constructor(label: string) {
    super(`008e_${label}`);
  }

  ingress(
    authenticator: ProviderEventAuthenticator,
    options: ProviderEventIngressOptions = {},
  ) {
    return createProviderEventIngress(this.runtimePool, authenticator, options);
  }

  binding(fixture: PaymentFixture, provider = "provider-a") {
    return { organizationId: fixture.organizationId, provider } as const;
  }

  collectionEvent(
    fixture: PaymentFixture,
    operationId: string,
    kind: "COLLECTION_SUCCEEDED" | "COLLECTION_FAILED" | "NO_FINANCIAL_CHANGE",
    overrides: Record<string, unknown> = {},
  ) {
    return {
      binding: this.binding(fixture),
      event: {
        kind,
        operationId,
        providerEventId: randomUUID(),
        providerReference: "event-reference",
        safeResultCode: null,
        ...overrides,
      },
    };
  }

  async unresolvedOperation(fixture: PaymentFixture) {
    const registry = new TestDigitalProviderRegistry();
    const provider = new TestDigitalProvider();
    registry.adapters.set("provider-a", provider);
    const operation = await this.collect(fixture, randomUUID(), registry);
    return { operation, provider, registry };
  }

  async referencedOperation(
    fixture: PaymentFixture,
    reference = "event-reference",
  ) {
    const registry = new TestDigitalProviderRegistry();
    const provider = new TestDigitalProvider();
    provider.handler = async () => ({
      kind: "REFERENCE_ATTACHED",
      providerReference: reference,
      safeResultCode: "ACCEPTED",
    });
    registry.adapters.set("provider-a", provider);
    const operation = await this.collect(fixture, randomUUID(), registry);
    return { operation, provider, registry };
  }

  async providerEffects(fixture: PaymentFixture) {
    const payment = await this.payment(fixture.sessionId);
    const events = await this.adminPool.query(
      `SELECT id::text, organization_id::text, payment_id::text,
              refund_id::text, provider, provider_event_id,
              provider_reference, processing_status::text,
              safe_result_code, received_at, processed_at
       FROM payment_provider_events
       WHERE payment_id = $1 ORDER BY created_at, id`,
      [payment.id],
    );
    const audits = await this.adminPool.query(
      `SELECT event_type, entity_type, entity_id::text, metadata_json
       FROM audit_events
       WHERE valet_session_id = $1 AND event_type LIKE 'PROVIDER_EVENT_%'
       ORDER BY occurred_at, id`,
      [fixture.sessionId],
    );
    const operations = await this.adminPool.query(
      `SELECT id::text, state::text, provider, provider_reference,
              safe_result_code, resolved_at
       FROM payment_collection_operations
       WHERE payment_id = $1 ORDER BY created_at, id`,
      [payment.id],
    );
    const refunds = await this.adminPool.query(
      `SELECT id::text, status::text, provider, provider_reference,
              completed_at, amount::text, reason, idempotency_key
       FROM refunds WHERE payment_id = $1 ORDER BY created_at, id`,
      [payment.id],
    );
    return {
      audits: audits.rows,
      events: events.rows,
      operations: operations.rows,
      payment,
      refunds: refunds.rows,
    };
  }

  async insertPendingRefund(
    fixture: PaymentFixture,
    providerReference: string | null = null,
  ) {
    const payment = await this.payment(fixture.sessionId);
    const refundId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO refunds
         (id, organization_id, payment_id, amount, reason, status,
          authorized_by_membership_id, idempotency_key, provider,
          provider_reference, requested_at)
       VALUES ($1, $2, $3, 1, 'Test refund', 'PENDING', $4, $5,
               'provider-a', $6, transaction_timestamp())`,
      [
        refundId,
        fixture.organizationId,
        payment.id,
        fixture.membershipId,
        randomUUID(),
        providerReference,
      ],
    );
    return refundId;
  }
}
