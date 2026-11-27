import type {
  DispositionLedgerStore,
  DispositionScope,
  IntentInput,
  ReceiptInput,
  LedgerEvent,
  LedgerCheckpointAuthenticator,
  SignedLedgerCheckpoint,
  TrustedLedgerAnchor,
} from "../src/modules/guest-access/rating-disposition-ledger-types";

export const ledgerId: string;
export const epoch: string;
export const scope: Readonly<DispositionScope>;
export function intent(overrides?: Partial<IntentInput>): IntentInput;
export function receipt(overrides?: Partial<ReceiptInput>): ReceiptInput;
export function testAuthenticator(): LedgerCheckpointAuthenticator;

export class InMemoryUnqualifiedLedger implements DispositionLedgerStore {
  constructor(head: SignedLedgerCheckpoint);
  head: SignedLedgerCheckpoint;
  events: LedgerEvent[];
  failure: string | null;
  readHead(): Promise<SignedLedgerCheckpoint>;
  readEvents(first: number, last: number): Promise<readonly LedgerEvent[]>;
  conditionalAppend(
    expected: SignedLedgerCheckpoint, event: LedgerEvent, next: SignedLedgerCheckpoint,
  ): Promise<"COMMITTED" | "CONFLICT" | "UNKNOWN">;
}

export interface TestWitness {
  minimum: SignedLedgerCheckpoint;
  failure: string | null;
  readMinimum(): Promise<SignedLedgerCheckpoint>;
  conditionalAdvance(
    expected: SignedLedgerCheckpoint, next: SignedLedgerCheckpoint,
  ): Promise<"ADVANCED" | "CONFLICT" | "UNKNOWN">;
}

export function fixture(): Promise<{
  crypt: LedgerCheckpointAuthenticator;
  store: InMemoryUnqualifiedLedger;
  anchor: TrustedLedgerAnchor & { witness: TestWitness };
}>;
