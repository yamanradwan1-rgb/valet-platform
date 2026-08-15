import { randomUUID } from "node:crypto";

import { createInitializePaymentExecutor } from "../src/modules/payments/initialize-payment-command";
import type { InitializePaymentOptions } from "../src/modules/payments/initialize-payment-command";
import type { PaymentProjection } from "../src/modules/payments/payment-types";
import { ShiftTestContext, type ShiftFixture } from "./shift-test-context";

export interface FinancialPolicyOptions {
  readonly currency?: string;
  readonly locationFeeOverride?: string | null;
  readonly locationMethodsOverride?:
    "CASH_ONLY" | "DIGITAL_ONLY" | "CASH_OR_DIGITAL" | null;
  readonly locationPayerOverride?: "CUSTOMER" | "VENUE" | null;
  readonly locationReleaseOverride?: boolean | null;
  readonly locationTipsOverride?: boolean | null;
  readonly locationValidationOverride?: boolean | null;
  readonly organizationFee?: string;
  readonly organizationMethods?:
    "CASH_ONLY" | "DIGITAL_ONLY" | "CASH_OR_DIGITAL";
  readonly organizationPayer?: "CUSTOMER" | "VENUE";
  readonly organizationRelease?: boolean;
  readonly organizationTips?: boolean;
  readonly organizationValidation?: boolean;
}

export interface PaymentFixture extends ShiftFixture {
  readonly sessionId: string;
  readonly vehicleId: string;
}

export class PaymentTestContext extends ShiftTestContext {
  constructor(label: string) {
    super(`008a_${label}`);
  }

  async createPaymentFixture(
    options: FinancialPolicyOptions = {},
  ): Promise<PaymentFixture> {
    const tenant = await this.createFixture();
    await this.adminPool.query(
      `UPDATE organizations
       SET valet_service_fee = $2, payment_service_payer = $3,
           payment_methods_policy = $4, tips_enabled = $5,
           validation_enabled = $6, release_requires_payment = $7,
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [
        tenant.organizationId,
        options.organizationFee ?? "0",
        options.organizationPayer ?? "CUSTOMER",
        options.organizationMethods ?? "CASH_ONLY",
        options.organizationTips ?? false,
        options.organizationValidation ?? false,
        options.organizationRelease ?? false,
      ],
    );
    await this.adminPool.query(
      `UPDATE locations
       SET currency = $2, valet_service_fee_override = $3,
           payment_service_payer_override = $4,
           payment_methods_policy_override = $5,
           tips_enabled_override = $6, validation_enabled_override = $7,
           release_requires_payment_override = $8,
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [
        tenant.locationId,
        options.currency ?? "JOD",
        options.locationFeeOverride ?? null,
        options.locationPayerOverride ?? null,
        options.locationMethodsOverride ?? null,
        options.locationTipsOverride ?? null,
        options.locationValidationOverride ?? null,
        options.locationReleaseOverride ?? null,
      ],
    );
    return await this.addSession(tenant);
  }

  async addSession(tenant: ShiftFixture): Promise<PaymentFixture> {
    const identity = randomUUID();
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, $3, transaction_timestamp())`,
      [vehicleId, tenant.organizationId, `Payment vehicle ${identity}`],
    );
    await this.adminPool.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          customer_access_revoked_at, organization_id, location_id,
          vehicle_id, state, checked_in_by_membership_id, version, updated_at)
       VALUES ($1, $2, transaction_timestamp(), transaction_timestamp(),
               $3, $4, $5, 'CHECKING_IN', $6, 1,
               transaction_timestamp())`,
      [
        sessionId,
        `payment-disabled:${identity}`,
        tenant.organizationId,
        tenant.locationId,
        vehicleId,
        tenant.membershipId,
      ],
    );
    return { ...tenant, sessionId, vehicleId };
  }

  initialize(
    fixture: Pick<PaymentFixture, "sessionId">,
    creationIdempotencyKey = randomUUID(),
    options: InitializePaymentOptions = {},
  ): Promise<PaymentProjection> {
    return createInitializePaymentExecutor(
      this.runtimePool,
      options,
    )({
      creationIdempotencyKey,
      valetSessionId: fixture.sessionId,
    });
  }

  async effects(sessionId: string) {
    const payment = await this.adminPool.query(
      `SELECT id::text, organization_id::text, location_id::text,
              valet_session_id::text, service_payer::text,
              collection_method::text, currency, service_amount::text,
              tip_amount::text, amount_due::text, amount_paid::text,
              status::text, creation_idempotency_key, provider,
              provider_reference, paid_at
       FROM payments WHERE valet_session_id = $1`,
      [sessionId],
    );
    const counts = await this.adminPool.query<{
      audit_count: number;
      cash_count: number;
      provider_event_count: number;
      refund_count: number;
      validation_count: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM audit_events
          WHERE valet_session_id = $1 AND event_type = 'PAYMENT_INITIALIZED')
           AS audit_count,
         (SELECT count(*)::integer FROM cash_entries AS child
          INNER JOIN payments AS payment ON payment.id = child.payment_id
          WHERE payment.valet_session_id = $1) AS cash_count,
         (SELECT count(*)::integer FROM validations AS child
          INNER JOIN payments AS payment ON payment.id = child.payment_id
          WHERE payment.valet_session_id = $1) AS validation_count,
         (SELECT count(*)::integer FROM refunds AS child
          INNER JOIN payments AS payment ON payment.id = child.payment_id
          WHERE payment.valet_session_id = $1) AS refund_count,
         (SELECT count(*)::integer FROM payment_provider_events AS child
          INNER JOIN payments AS payment ON payment.id = child.payment_id
          WHERE payment.valet_session_id = $1) AS provider_event_count`,
      [sessionId],
    );
    return { counts: counts.rows[0]!, payments: payment.rows };
  }

  async sessionSnapshot(sessionId: string) {
    const result = await this.adminPool.query(
      `SELECT state::text, version, parking_zone_id::text,
              parking_spot_id::text, key_slot_id::text,
              current_assignee_membership_id::text, updated_at
       FROM valet_sessions WHERE id = $1`,
      [sessionId],
    );
    return result.rows[0];
  }
}
