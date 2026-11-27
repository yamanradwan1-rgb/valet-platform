import type {
  DispositionAction,
  DispositionOutcome,
  DispositionLedgerStore,
  LedgerCheckpointAuthenticator,
  TrustedLedgerAnchor,
  DispositionScope,
} from "../src/modules/guest-access/rating-disposition-ledger-types";
import type { QuarantinedRestoreTarget } from
  "../src/modules/guest-access/rating-disposition-ledger-restore";

export function recordCompleted(
  store: DispositionLedgerStore,
  crypt: LedgerCheckpointAuthenticator,
  anchor: TrustedLedgerAnchor,
  action: DispositionAction,
  outcome: DispositionOutcome,
  suffix?: string,
  overrides?: Partial<DispositionScope>,
): Promise<void>;

export function fakeRestoreTarget(): QuarantinedRestoreTarget & {
  calls: string[];
};
