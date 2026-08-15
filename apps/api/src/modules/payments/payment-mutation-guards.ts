import type { PostgresTransaction } from "../../common/database/postgres";
import { FinancialMutationError } from "./payment-mutation-errors";
import { parseMoney } from "./payment-money";
import { hasCollectionEvidence } from "./payment-mutation-repository";
import type { MutablePayment } from "./payment-mutation-types";

export async function assertCollectionNotStarted(
  transaction: PostgresTransaction,
  payment: MutablePayment,
): Promise<void> {
  const started =
    parseMoney(payment.amountPaid, true) > 0n ||
    payment.status === "PENDING" ||
    payment.status === "PAID" ||
    payment.provider !== null ||
    payment.providerReference !== null ||
    (await hasCollectionEvidence(transaction, payment));
  if (started) throw new FinancialMutationError("COLLECTION_ALREADY_STARTED");
}
