import type { PostgresTransaction } from "../../common/database/postgres";
import { CustodyMutationError } from "../valet-sessions/protected-custody-command";
import type { AuthorizedKeySession } from "./key-types";

export function assertKeyCommandGuards(
  session: AuthorizedKeySession,
  expectedVersion: number,
): void {
  if (session.version !== expectedVersion) {
    throw new CustodyMutationError("VERSION_CONFLICT");
  }
  if (session.state !== "AWAITING_PARKING") {
    throw new CustodyMutationError("INVALID_STATE_TRANSITION");
  }
}

export function validateExpectedVersion(expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new CustodyMutationError("VERSION_CONFLICT");
  }
}

export async function mutateCurrentKeySlot(
  transaction: PostgresTransaction,
  input: {
    readonly expectedVersion: number;
    readonly keySlotId: string | null;
    readonly operationTime: Date;
    readonly sessionId: string;
  },
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE valet_sessions
     SET key_slot_id = $3,
         version = version + 1,
         updated_at = $4
     WHERE id = $1
       AND version = $2
       AND state = 'AWAITING_PARKING'
     RETURNING version`,
    [
      input.sessionId,
      input.expectedVersion,
      input.keySlotId,
      input.operationTime,
    ],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) {
    throw new Error("Guarded KeySlot mutation did not succeed.");
  }
  return version;
}
