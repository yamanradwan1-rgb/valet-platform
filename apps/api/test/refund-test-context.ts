import { randomUUID } from "node:crypto";

import { createRefundExecutor } from "../src/modules/payments/refund-command";
import type { RefundCommandRequest } from "../src/modules/payments/refund-types";
import {
  ProviderEventTestContext,
  TestProviderEventAuthenticator,
} from "./provider-event-test-context";
import type { FinancialActorFixture } from "./financial-mutation-test-context";
import type { PaymentFixture } from "./payment-test-context";

export class RefundTestContext extends ProviderEventTestContext {
  constructor(label: string) {
    super(`008f_${label}`);
  }

  refund(
    fixture: PaymentFixture,
    actor: FinancialActorFixture,
    request: Omit<
      RefundCommandRequest,
      "authenticatedUserId" | "valetSessionId"
    >,
    options: Parameters<typeof createRefundExecutor>[1] = {},
  ) {
    return createRefundExecutor(
      this.runtimePool,
      options,
    )({
      authenticatedUserId: actor.userId,
      valetSessionId: fixture.sessionId,
      ...request,
    });
  }

  async collectedPayment(method: "CASH" | "DIGITAL" = "CASH") {
    const fixture = await this.createPaymentFixture({ organizationFee: "10" });
    const payment = await this.initialize(fixture);
    const paidAt = new Date("2026-08-20T12:00:00.000Z");
    await this.adminPool.query(
      `UPDATE payments
       SET collection_method = $2::payment_collection_method,
           amount_paid = amount_due, status = 'PAID', paid_at = $3,
           provider = $4, provider_reference = $5,
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [
        payment.id,
        method,
        paidAt,
        method === "DIGITAL" ? "provider-a" : null,
        method === "DIGITAL" ? `payment-${randomUUID()}` : null,
      ],
    );
    if (method === "CASH") {
      await this.adminPool.query(
        `INSERT INTO cash_entries
           (id, organization_id, payment_id, entry_type, amount,
            received_or_adjusted_by_membership_id, submission_idempotency_key,
            occurred_at)
         VALUES ($1, $2, $3, 'RECEIPT', 10, $4, $5, $6)`,
        [
          randomUUID(),
          fixture.organizationId,
          payment.id,
          fixture.membershipId,
          randomUUID(),
          paidAt,
        ],
      );
    }
    return { fixture, paymentId: payment.id };
  }

  async refundEffects(fixture: PaymentFixture) {
    const payment = await this.payment(fixture.sessionId);
    const refunds = await this.adminPool.query(
      `SELECT id::text, payment_id::text, amount::text, reason, status::text,
              authorized_by_membership_id::text, idempotency_key, provider,
              provider_reference, requested_at, completed_at, created_at
       FROM refunds WHERE payment_id = $1 ORDER BY created_at, id`,
      [payment.id],
    );
    const audits = await this.adminPool.query(
      `SELECT id::text, actor_membership_id::text, event_type, entity_type,
              entity_id::text, metadata_json
       FROM audit_events
       WHERE valet_session_id = $1 AND event_type = 'PAYMENT_REFUND_CREATED'
       ORDER BY occurred_at, id`,
      [fixture.sessionId],
    );
    const cash = await this.adminPool.query(
      `SELECT id::text, entry_type::text, amount::text
       FROM cash_entries WHERE payment_id = $1 ORDER BY occurred_at, id`,
      [payment.id],
    );
    return {
      audits: audits.rows,
      cash: cash.rows,
      payment,
      refunds: refunds.rows,
    };
  }

  async reconcileRefund(
    fixture: PaymentFixture,
    refundId: string,
    kind: "REFUND_SUCCEEDED" | "REFUND_FAILED",
  ) {
    const authenticator = new TestProviderEventAuthenticator();
    authenticator.handler = async () => ({
      binding: this.binding(fixture),
      event: {
        kind,
        providerEventId: randomUUID(),
        providerReference: `refund-${randomUUID()}`,
        refundId,
        safeResultCode: null,
      },
    });
    return this.ingress(authenticator)({});
  }
}

export async function expectRefundError(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected Refund error ${code}.`);
  } catch (error) {
    if ((error as { code?: string }).code !== code) throw error;
  }
}
