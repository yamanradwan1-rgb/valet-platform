import { randomUUID } from "node:crypto";

import type {
  PaymentPayerCorrectionRequest,
  PaymentServiceAmountCorrectionRequest,
  ValidationMutationRequest,
} from "@valet/contracts";
import { resolveEffectiveFinancialPolicy } from "../src/modules/payments/financial-policy-resolver";
import { authorizeManagerFinancialMutation } from "../src/modules/payments/payment-authorization";
import { lockCanonicalPayment } from "../src/modules/payments/payment-mutation-repository";
import type {
  FinancialActor,
  PaymentMutationProjection,
} from "../src/modules/payments/payment-mutation-types";
import {
  correctPayer,
  correctServiceAmount,
  mutateTip,
} from "../src/modules/payments/payment-term-command";
import {
  inPaymentTransaction,
  loadPaymentOperationTime,
} from "../src/modules/payments/payment-transaction";
import { mutateValidation } from "../src/modules/payments/validation-command";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { resolveAndLockGuestAccessSession } from "../src/modules/valet-sessions/guest-access-session-resolution";
import {
  PaymentTestContext,
  type PaymentFixture,
} from "./payment-test-context";
import type { ShiftFixtureOptions, TestRole } from "./shift-test-context";

export interface FinancialActorFixture {
  readonly membershipId: string;
  readonly userId: string;
}

export class FinancialMutationTestContext extends PaymentTestContext {
  constructor(label: string) {
    super(`008b_${label}`);
  }

  async actor(
    fixture: PaymentFixture,
    role: TestRole = "LOCATION_MANAGER",
    options: ShiftFixtureOptions = {},
  ): Promise<FinancialActorFixture> {
    const userId = randomUUID();
    const membershipId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-real-password-hash', $3,
               transaction_timestamp())`,
      [
        userId,
        `${randomUUID()}@financial.test`,
        options.userStatus ?? "ACTIVE",
      ],
    );
    await this.adminPool.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
      [
        membershipId,
        fixture.organizationId,
        userId,
        role,
        options.membershipStatus ?? "ACTIVE",
      ],
    );
    if (options.locationAccess !== false) {
      await this.adminPool.query(
        `INSERT INTO membership_location_access
           (organization_id, membership_id, location_id)
         VALUES ($1, $2, $3)`,
        [fixture.organizationId, membershipId, fixture.locationId],
      );
    }
    return { membershipId, userId };
  }

  async validation(
    fixture: PaymentFixture,
    actor: FinancialActorFixture,
    request: ValidationMutationRequest,
  ) {
    return this.managerMutation(fixture, actor, (transaction, context) =>
      mutateValidation(transaction, { ...context, request }),
    );
  }

  async managerTip(
    fixture: PaymentFixture,
    actor: FinancialActorFixture,
    tipAmount: string,
  ) {
    return this.managerMutation(fixture, actor, (transaction, context) =>
      mutateTip(transaction, { ...context, tipAmount }),
    );
  }

  async payer(
    fixture: PaymentFixture,
    actor: FinancialActorFixture,
    request: PaymentPayerCorrectionRequest,
  ) {
    return this.managerMutation(fixture, actor, (transaction, context) =>
      correctPayer(transaction, { ...context, ...request }),
    );
  }

  async serviceAmount(
    fixture: PaymentFixture,
    actor: FinancialActorFixture,
    request: PaymentServiceAmountCorrectionRequest,
  ) {
    return this.managerMutation(fixture, actor, (transaction, context) =>
      correctServiceAmount(transaction, { ...context, ...request }),
    );
  }

  async guestToken(fixture: PaymentFixture): Promise<string> {
    const token = randomUUID().replaceAll("-", "") + "abcdefghijk";
    await this.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash = $2,
           customer_access_expires_at = transaction_timestamp() + interval '1 day',
           customer_access_revoked_at = NULL
       WHERE id = $1`,
      [fixture.sessionId, hashGuestAccessToken(token)],
    );
    return token;
  }

  async guestTip(rawToken: string, tipAmount: string) {
    return inPaymentTransaction(this.runtimePool, async (transaction) => {
      const scope = await resolveAndLockGuestAccessSession(
        transaction,
        rawToken,
      );
      const payment = await lockCanonicalPayment(transaction, scope);
      const policy = (await resolveEffectiveFinancialPolicy(transaction, scope))
        .policy;
      return mutateTip(transaction, {
        actor: { actorClass: "GUEST", membershipId: null },
        operationTime: await loadPaymentOperationTime(transaction),
        payment,
        policy,
        tipAmount,
      });
    });
  }

  async validations(paymentId: string) {
    const result = await this.adminPool.query(
      `SELECT id::text, mode::text, amount::text, is_current,
              supersedes_validation_id::text
       FROM validations WHERE payment_id = $1 ORDER BY applied_at, id`,
      [paymentId],
    );
    return result.rows;
  }

  async financialAudits(sessionId: string) {
    const result = await this.adminPool.query(
      `SELECT actor_membership_id::text, event_type, entity_id::text,
              metadata_json
       FROM audit_events
       WHERE valet_session_id = $1 AND event_type LIKE 'PAYMENT_%'
          OR valet_session_id = $1 AND event_type LIKE 'VALIDATION_%'
       ORDER BY occurred_at, id`,
      [sessionId],
    );
    return result.rows;
  }

  async payment(sessionId: string) {
    const result = await this.adminPool.query(
      `SELECT id::text, service_payer::text, service_amount::text,
              tip_amount::text, amount_due::text, amount_paid::text,
              collection_method::text, status::text, provider,
              provider_reference, paid_at, currency
       FROM payments WHERE valet_session_id = $1`,
      [sessionId],
    );
    return result.rows[0]!;
  }

  async addCashEvidence(
    fixture: PaymentFixture,
    paymentId: string,
  ): Promise<void> {
    await this.adminPool.query(
      `INSERT INTO cash_entries
         (id, organization_id, payment_id, entry_type, amount,
          received_or_adjusted_by_membership_id, submission_idempotency_key,
          occurred_at)
       VALUES ($1, $2, $3, 'RECEIPT', 1, $4, $5,
               transaction_timestamp())`,
      [
        randomUUID(),
        fixture.organizationId,
        paymentId,
        fixture.membershipId,
        randomUUID(),
      ],
    );
  }

  private async managerMutation(
    fixture: PaymentFixture,
    actor: FinancialActorFixture,
    operation: (
      transaction: Parameters<typeof mutateTip>[0],
      context: {
        actor: FinancialActor;
        operationTime: Date;
        payment: Parameters<typeof mutateTip>[1]["payment"];
        policy: Parameters<typeof mutateTip>[1]["policy"];
      },
    ) => Promise<PaymentMutationProjection>,
  ) {
    return inPaymentTransaction(this.runtimePool, async (transaction) => {
      const authorized = await authorizeManagerFinancialMutation(
        transaction,
        actor.userId,
        fixture.sessionId,
      );
      const payment = await lockCanonicalPayment(transaction, authorized.scope);
      const policy = (
        await resolveEffectiveFinancialPolicy(transaction, authorized.scope)
      ).policy;
      return operation(transaction, {
        actor: authorized.actor,
        operationTime: await loadPaymentOperationTime(transaction),
        payment,
        policy,
      });
    });
  }
}
