import type { PostgresTransaction } from "../src/common/database/postgres";
import { signS04Counted } from "../src/modules/anti-abuse/s04-signed-sql-proof";

// Run the real signed S04 writer inside the caller's transaction. This leaves
// cancellation, rollback and ambiguous COMMIT semantics under PostgreSQL.
export async function insertGuestT3Probe(
  transaction: PostgresTransaction,
  hashCharacter: "a" | "d" | "e" | "f",
): Promise<void> {
  const key = {
    scope: "v1:guest-token" as const,
    keyHash: `anti-abuse-hmac-sha256:v1:${hashCharacter.repeat(64)}`,
    lockHigh: 0,
    lockLow: 0,
  };
  const proof = signS04Counted(key);
  await transaction.query(
    "SELECT public.s04_counted($1,$2,$3::uuid,$4::bigint,$5)",
    [key.scope, key.keyHash, proof.nonce, proof.expiresMs, proof.mac],
  );
}
