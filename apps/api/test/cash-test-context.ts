import {
  createCashAdjustmentExecutor,
  createCashReceiptExecutor,
} from "../src/modules/payments/cash-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import {
  FinancialMutationTestContext,
  type FinancialActorFixture,
} from "./financial-mutation-test-context";
import type { PaymentFixture } from "./payment-test-context";

export class CashTestContext extends FinancialMutationTestContext {
  constructor(label: string) {
    super(`008c_${label}`);
  }

  receipt(
    fixture: PaymentFixture,
    actor: FinancialActorFixture,
    submissionIdempotencyKey: string,
    options: Parameters<typeof createCashReceiptExecutor>[1] = {},
  ) {
    return createCashReceiptExecutor(
      this.runtimePool,
      options,
    )({
      authenticatedUserId: actor.userId,
      submissionIdempotencyKey,
      valetSessionId: fixture.sessionId,
    });
  }

  adjustment(
    fixture: PaymentFixture,
    actor: FinancialActorFixture,
    input: {
      amount: string;
      entryType: "ADJUSTMENT_DECREASE" | "ADJUSTMENT_INCREASE";
      reason: string;
      submissionIdempotencyKey: string;
    },
    options: Parameters<typeof createCashAdjustmentExecutor>[1] = {},
  ) {
    return createCashAdjustmentExecutor(
      this.runtimePool,
      options,
    )({
      authenticatedUserId: actor.userId,
      valetSessionId: fixture.sessionId,
      ...input,
    });
  }

  startShift(fixture: PaymentFixture, actor: FinancialActorFixture) {
    return createStartShiftCommandExecutor(this.runtimePool)({
      authenticatedUserId: actor.userId,
      targetLocationId: fixture.locationId,
    });
  }

  endShift(
    actor: FinancialActorFixture,
    shiftId: string,
    cashReported: string,
    options: Parameters<typeof createEndShiftCommandExecutor>[1] = {},
  ) {
    return createEndShiftCommandExecutor(
      this.runtimePool,
      options,
    )({
      authenticatedUserId: actor.userId,
      cashReported,
      shiftId,
    });
  }

  async cashEffects(fixture: PaymentFixture) {
    const payment = await this.payment(fixture.sessionId);
    const entries = await this.adminPool.query(
      `SELECT id::text, entry_type::text, amount::text, reason,
              received_or_adjusted_by_membership_id::text,
              submission_idempotency_key, occurred_at
       FROM cash_entries WHERE payment_id = $1 ORDER BY occurred_at, id`,
      [payment.id],
    );
    const audits = await this.adminPool.query(
      `SELECT id::text, event_type, actor_membership_id::text, metadata_json
       FROM audit_events
       WHERE valet_session_id = $1 AND event_type LIKE 'PAYMENT_CASH_%'
       ORDER BY occurred_at, id`,
      [fixture.sessionId],
    );
    return { audits: audits.rows, entries: entries.rows, payment };
  }

  async shiftSnapshot(shiftId: string) {
    const result = await this.adminPool.query(
      `SELECT status::text, ended_at, cash_expected::text,
              cash_reported::text, cash_variance::text, cash_currency,
              cash_reported_at, cash_reported_by_membership_id::text
       FROM shifts WHERE id = $1`,
      [shiftId],
    );
    return result.rows[0]!;
  }
}

export async function expectCashError(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected cash error ${code}.`);
  } catch (error) {
    if ((error as { code?: string }).code !== code) throw error;
  }
}
