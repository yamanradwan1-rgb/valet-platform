import { createHmac, randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../../common/database/postgres";
import type { StaffSessionContext } from "../staff-session-context";
import { MfaStepUpRequiredError } from "./mfa-errors";

interface ContextRow {
  readonly db: string;
  readonly pid: number;
  readonly xid: string;
  readonly ms: string;
}

function activitySecret(): Buffer {
  const configured = process.env.MFA_ACTIVITY_PROOF_SECRET_B64URL;
  if (configured === undefined || !/^[A-Za-z0-9_-]{43}$/.test(configured)) {
    throw new Error("MFA activity proof secret is unavailable.");
  }
  const key = Buffer.from(configured, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== configured) {
    throw new Error("MFA activity proof secret is invalid.");
  }
  return key;
}

/**
 * A purpose-restricted authenticated activity touch on the SAME backend/XID.
 * Merely knowing the SQL session, verifier hash or User UUID never mints this
 * proof. The secret is application-only and the private DB root is SQL-hidden.
 */
export async function registerProtectedAdminActivity(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<void> {
  const meta = await transaction.query<ContextRow>(
    `SELECT pg_catalog.current_database() AS db,
            pg_catalog.pg_backend_pid() AS pid,
            pg_catalog.pg_current_xact_id()::text AS xid,
            pg_catalog.trunc(EXTRACT(
              epoch FROM pg_catalog.clock_timestamp())*1000)::text AS ms`,
  );
  const row = meta.rows[0];
  if (!row || meta.rowCount !== 1) throw new MfaStepUpRequiredError();
  const nonce = randomUUID();
  const message = [
    "MFA_ADMIN_ACTIVITY/v1", row.db, context.staffAuthSessionId,
    context.userId, context.accessTokenHash, nonce, String(row.pid),
    row.xid, row.ms,
  ].join("|");
  const mac = createHmac("sha256", activitySecret())
    .update(message, "utf8").digest();
  try {
    const applied = await transaction.query<{ applied: number }>(
      `SELECT mfa_activity_private.touch_admin_activity(
         $1::uuid,$2::uuid,$3::text,$4::uuid,$5::integer,
         $6::text,$7::bigint,$8::bytea) AS applied`,
      [
        context.staffAuthSessionId, context.userId, context.accessTokenHash,
        nonce, row.pid, row.xid, row.ms, mac,
      ],
    );
    if (applied.rows[0]?.applied !== 1 || applied.rowCount !== 1) {
      throw new MfaStepUpRequiredError();
    }
  } catch (error) {
    if ((error as { code?: string }).code === "42501") {
      throw new MfaStepUpRequiredError();
    }
    throw error;
  }
}
