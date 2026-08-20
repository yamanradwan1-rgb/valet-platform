import type { PostgresTransaction } from "../../common/database/postgres";
import { resolveEffectiveFinancialPolicy } from "./financial-policy-resolver";
import {
  isPaymentReleaseSatisfied,
  type ReleasePaymentState,
} from "./payment-release-satisfaction";
import type { PaymentCollectionMethod, PaymentStatus } from "./payment-types";

interface ReleasePaymentRow {
  readonly amount_due: string;
  readonly amount_paid: string;
  readonly collection_method: PaymentCollectionMethod;
  readonly paid_at: Date | null;
  readonly provider: string | null;
  readonly provider_reference: string | null;
  readonly status: PaymentStatus;
}

function project(row: ReleasePaymentRow): ReleasePaymentState {
  return {
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    collectionMethod: row.collection_method,
    paidAt: row.paid_at,
    provider: row.provider,
    providerReference: row.provider_reference,
    status: row.status,
  };
}

export class FinancialReleaseError extends Error {
  readonly code = "FINANCIAL_RELEASE_NOT_SATISFIED";

  constructor() {
    super("The financial release requirement is not satisfied.");
    this.name = "FinancialReleaseError";
  }
}

export async function assertFinancialReleaseSatisfied(
  transaction: PostgresTransaction,
  scope: {
    readonly id: string;
    readonly location_id: string;
    readonly organization_id: string;
  },
): Promise<void> {
  const releaseRequiresPayment = (
    await resolveEffectiveFinancialPolicy(transaction, {
      locationId: scope.location_id,
      organizationId: scope.organization_id,
    })
  ).policy.releaseRequiresPayment;
  if (!releaseRequiresPayment) return;
  const result = await transaction.query<ReleasePaymentRow>(
    `SELECT amount_due::text, amount_paid::text, collection_method::text,
            paid_at, provider, provider_reference, status::text
     FROM payments
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3
     FOR SHARE`,
    [scope.organization_id, scope.location_id, scope.id],
  );
  const row = result.rows[0];
  if (
    !isPaymentReleaseSatisfied(true, row === undefined ? null : project(row))
  ) {
    throw new FinancialReleaseError();
  }
}
