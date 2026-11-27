import type {
  AuthorizedNoOpInspector,
  FencedNoOpEvidence,
  IntentInput,
  LedgerEvent,
  NoOpInput,
} from "../src/modules/guest-access/rating-disposition-ledger-types";

export function expiredIntent(overrides?: Partial<IntentInput>): IntentInput;
export function noOpFrom(
  original: LedgerEvent & { kind: "INTENT" }, overrides?: Partial<NoOpInput>,
): NoOpInput;
export function inspectorFor(
  original: LedgerEvent & { kind: "INTENT" },
  changes?: Partial<FencedNoOpEvidence>,
): AuthorizedNoOpInspector;
