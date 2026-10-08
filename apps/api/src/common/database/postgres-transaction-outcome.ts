import type { PostgresTransaction } from "./postgres";

export type TransactionOutcome = "COMMITTED" | "ROLLED_BACK" | "UNAVAILABLE";
type Observer = (outcome: TransactionOutcome) => void;
const observers = new WeakMap<PostgresTransaction, Observer[]>();

export function beginTransactionOutcomes(
  transaction: PostgresTransaction,
): void {
  observers.set(transaction, []);
}

export function observeTransactionOutcome(
  transaction: PostgresTransaction,
  observer: Observer,
): void {
  const pending = observers.get(transaction);
  if (pending === undefined) {
    try {
      observer("UNAVAILABLE");
    } catch {
      /* Instrumentation is isolated. */
    }
    return;
  }
  pending.push(observer);
}

export function finishTransactionOutcomes(
  transaction: PostgresTransaction,
  outcome: TransactionOutcome,
): void {
  const pending = observers.get(transaction) ?? [];
  observers.delete(transaction);
  for (const observer of pending) {
    try {
      observer(outcome);
    } catch {
      /* Metrics never affect authorization. */
    }
  }
}
