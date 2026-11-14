import { createHash, createHmac, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../../common/database/postgres";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import {
  observeTransactionOutcome,
  type TransactionOutcome,
} from "../../../common/database/postgres-transaction-outcome";
import { RUNTIME_POSTGRES_POOL } from "../../../common/database/runtime-database.module";
import {
  AntiAbuseUnavailableError,
  type AntiAbusePendingReservation,
} from "../../anti-abuse/anti-abuse.service";
import {
  generateStaffCredential,
  staffCredentialHash,
} from "../staff-auth-credential";
import { staffAuthTokenResult } from "../staff-auth-token-result";
import { StaffAuthenticationError } from "../staff-auth-types";
import type {
  LoginSessionRow,
  StaffAuthTokens,
  UserAuthenticationRow,
} from "../staff-auth-types";
import { verifySubmittedStaffLoginPassword } from "../staff-auth-vap1-login-ceremony";
import { Argon2StaffPasswordVerifier } from "../staff-password-verification";
import { lockAndRecheckStaffLoginUser } from "../staff-user-security-lock";
import { encodeU2StaffLoginPayload } from "../vap1-typed/u2-staff-login";
import { assertA01CeremonyFrameCoherence } from "./vap1-a01-ceremony-binding";
import { validateVap1OfflineKeyringFormat } from "./vap1-keyring-offline-format";
import { decodeVap1Proof } from "./vap1-proof";
import { reconcileA01UnknownCommit } from "./issue416-a01-unknown-commit";

interface A01PreparedRow {
  readonly challenge_id: string;
  readonly proof_bytes: Buffer;
  readonly payload_bytes: Buffer;
  readonly state_bytes: Buffer;
  readonly key_id: string;
  readonly key_promotion_epoch: string;
  readonly backend_pid: number;
  readonly full_xid: string;
}

interface A01CommittedRow extends LoginSessionRow {
  readonly operation_id: string;
  readonly receipt_challenge_id: string;
}

interface KeyringEntry {
  readonly keyId: string;
  readonly audience: string;
  readonly keyB64url: string;
}

function exactPositiveSqlInteger(value: unknown): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new AntiAbuseUnavailableError();
  }
  return BigInt(value);
}

/**
 * A01 only: the selected root is loaded after an independently checked
 * PostgreSQL prepare, used once for this exact proof and zeroed immediately.
 * No sign(bytes), key-returning API, or caller-provided key/purpose exists.
 */
function macForPreparedA01Proof(
  proofBytes: Buffer,
  selectedKeyId: string,
  expectedAudience: string,
): Buffer {
  const serialized = process.env.VAYLET_AUTH_PROOF_KEYRING_JSON;
  validateVap1OfflineKeyringFormat(serialized, expectedAudience);
  const entries = JSON.parse(serialized!) as KeyringEntry[];
  const selected = entries.find((entry) => entry.keyId === selectedKeyId);
  if (selected === undefined) throw new AntiAbuseUnavailableError();
  const root = Buffer.from(selected.keyB64url, "base64url");
  try {
    return createHmac("sha256", root).update(proofBytes).digest();
  } finally {
    root.fill(0);
  }
}

/**
 * Closed A01 command for a trusted Staff Auth request owner. It owns the pool
 * and password verifier; callers can submit only a raw login request and the
 * ingress-created limiter reservation, never a User, PHC, SQL client, proof,
 * session identity, selected key or transaction descriptor.
 *
 * This class deliberately has no Nest registration or route binding. SQL
 * a01_bind_limiter/prepare/execute/finalize are an integration contract still
 * awaiting W33 private, purpose-fixed PG17 implementation and review. It must
 * not replace the existing Staff Auth login until those independent gates
 * and U1 deployment key custody have passed.
 */
@Injectable()
export class Issue416A01ProtectedLogin {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async login(
    email: string,
    submittedPassword: string,
    identifierReservation: AntiAbusePendingReservation,
  ): Promise<StaffAuthTokens> {
    if (
      typeof email !== "string" ||
      typeof submittedPassword !== "string" ||
      !identifierReservation ||
      identifierReservation.key?.scope !== "v1:staff-login-identifier" ||
      typeof identifierReservation.id !== "string" ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(
        identifierReservation.id,
      ) ||
      !/^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$/.test(
        identifierReservation.key.keyHash,
      )
    ) throw new AntiAbuseUnavailableError();

    const audience = process.env.VAYLET_AUTH_PROOF_AUDIENCE;
    if (!audience || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(audience)) {
      throw new AntiAbuseUnavailableError();
    }

    const operationId = randomUUID();
    const sessionId = randomUUID();
    const refreshId = randomUUID();
    const rawAccess = generateStaffCredential("vsa1.");
    const rawRefresh = generateStaffCredential("vsr1.");
    const accessHash = staffCredentialHash("access", rawAccess);
    const refreshHash = staffCredentialHash("refresh", rawRefresh);

    // A durable pre-domain operation binding MUST commit independently before
    // password work. A failed/ambiguous COMMIT is never automatically retried.
    await inPostgresTransaction(this.pool, async (transaction) => {
      const bound = await transaction.query<{ readonly bound: boolean }>(
        `SELECT bound FROM auth_proof_private.a01_bind_limiter(
           $1::text, $2::uuid, $3::uuid, $4::text, $5::text
         )`,
        [
          audience,
          operationId,
          identifierReservation.id,
          identifierReservation.key.scope,
          identifierReservation.key.keyHash,
        ],
      );
      if (bound.rows[0]?.bound !== true) throw new AntiAbuseUnavailableError();
    });

    const lookup = await this.pool.query<UserAuthenticationRow>(
      `SELECT id, password_hash, status FROM users WHERE email = $1`,
      [email],
    );
    const user = lookup.rows[0];
    const verifiedPhc = await verifySubmittedStaffLoginPassword({
      user,
      submittedPassword,
      verifier: new Argon2StaffPasswordVerifier(),
    });
    if (user === undefined) throw new StaffAuthenticationError();
    const phcDigest = createHash("sha256").update(verifiedPhc).digest();

    let outcome: TransactionOutcome | undefined;
    let committed: A01CommittedRow | LoginSessionRow;
    try {
      committed = await inPostgresTransaction(this.pool, async (transaction) => {
      observeTransactionOutcome(transaction, (result) => {
        outcome = result;
      });
      if (!await lockAndRecheckStaffLoginUser(transaction, user.id, verifiedPhc)) {
        throw new StaffAuthenticationError();
      }
      // These specific SQL functions must lock/rebuild the protected state,
      // issue the nonce and execute the complete mutation/audit/receipt
      // atomically on this SAME leased backend and full XID.
      const prepared = await transaction.query<A01PreparedRow>(
        `SELECT * FROM auth_proof_private.a01_prepare(
           $1::text,$2::uuid,$3::uuid,$4::bytea,$5::uuid,$6::uuid,
           $7::text,$8::text,$9::uuid
         )`,
        [
          audience, operationId, user.id, phcDigest, sessionId, refreshId,
          accessHash, refreshHash, identifierReservation.id,
        ],
      );
      const row = prepared.rows[0];
      if (!row || prepared.rows.length !== 1) throw new AntiAbuseUnavailableError();
      const owned = await transaction.query<{
        readonly backend_pid: number;
        readonly full_xid: string;
      }>(
        `SELECT pg_backend_pid() AS backend_pid,
                pg_current_xact_id()::text AS full_xid`,
      );
      const identity = owned.rows[0];
      const epoch = exactPositiveSqlInteger(row.key_promotion_epoch);
      const ownedXid = exactPositiveSqlInteger(identity?.full_xid);
      const canonicalPayload = encodeU2StaffLoginPayload({
        operationId,
        userId: user.id,
        verifiedPasswordDigest: phcDigest,
        newSessionId: sessionId,
        newRefreshId: refreshId,
        newAccessHash: accessHash,
        newRefreshHash: refreshHash,
        limiterReservationId: identifierReservation.id,
      });
      if (
        !identity || identity.backend_pid !== row.backend_pid ||
        ownedXid !== exactPositiveSqlInteger(row.full_xid) ||
        !canonicalPayload.equals(row.payload_bytes)
      ) throw new AntiAbuseUnavailableError();
      // The same raw password is verified by concrete Argon2id again inside
      // the leased transaction before any MAC. The descriptor is NOT trusted
      // merely because it was supplied by a SQL query result.
      await assertA01CeremonyFrameCoherence({
        user,
        submittedPassword,
        newRawAccessToken: rawAccess,
        newRawRefreshToken: rawRefresh,
        newSessionId: sessionId,
        newRefreshId: refreshId,
        operationId,
        limiterReservationId: identifierReservation.id,
        deploymentAudience: audience,
        selectedKeyId: row.key_id,
        selectedKeyEpoch: epoch,
        ownedBackendPid: identity.backend_pid,
        ownedFullXid: ownedXid,
        payloadBytes: row.payload_bytes,
        stateBytes: row.state_bytes,
        proofBytes: row.proof_bytes,
      });
      const proof = decodeVap1Proof(row.proof_bytes);
      if (proof.challengeNonce.length !== 32) throw new AntiAbuseUnavailableError();
      const mac = macForPreparedA01Proof(row.proof_bytes, row.key_id, audience);
      const executed = await transaction.query<A01CommittedRow>(
        `SELECT * FROM auth_proof_private.a01_execute(
           $1::uuid,$2::bytea,$3::bytea,$4::bytea,$5::bytea
         )`,
        [
          row.challenge_id, row.proof_bytes, mac,
          row.payload_bytes, row.state_bytes,
        ],
      );
      const result = executed.rows[0];
      if (
        !result || executed.rows.length !== 1 ||
        result.id !== sessionId || result.operation_id !== operationId ||
        result.receipt_challenge_id !== row.challenge_id
      ) throw new AntiAbuseUnavailableError();
      return result;
      });
    } catch (error) {
      // The only permitted recovery from an ambiguous domain COMMIT is one
      // authoritative immutable-receipt read. A rollback or missing receipt
      // never triggers execute again or returns precreated raw credentials.
      if (outcome !== "UNAVAILABLE") throw error;
      const recovered = await reconcileA01UnknownCommit(this.pool, {
        audience, operationId, userId: user.id,
        sessionId, refreshId, limiterReservationId: identifierReservation.id,
        accessHash, refreshHash,
      });
      if (recovered === undefined) throw new AntiAbuseUnavailableError();
      committed = recovered;
    }

    // Finalization must independently verify the committed immutable
    // operation receipt and the original reservation. Unknown COMMIT must
    // keep the pending limiter conservative; this call cannot mint a session.
    await inPostgresTransaction(this.pool, async (transaction) => {
      const done = await transaction.query<{ readonly finalized: boolean }>(
        `SELECT finalized FROM auth_proof_private.a01_finalize_limiter(
           $1::text, $2::uuid, $3::uuid
         )`,
        [audience, operationId, identifierReservation.id],
      );
      if (done.rows[0]?.finalized !== true) throw new AntiAbuseUnavailableError();
    });
    return staffAuthTokenResult(committed, rawAccess, rawRefresh);
  }
}
