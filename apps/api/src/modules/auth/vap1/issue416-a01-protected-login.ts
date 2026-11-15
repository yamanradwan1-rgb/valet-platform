import { createHash, createHmac, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../../common/database/postgres";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import {
  observeTransactionOutcome,
  type TransactionOutcome,
} from "../../../common/database/postgres-transaction-outcome";
import { RUNTIME_POSTGRES_POOL } from "../../../common/database/runtime-database.module";
import type { ApiRequest } from "../../../common/http/api-request";
import {
  AntiAbuseUnavailableError,
  type AntiAbusePendingReservation,
} from "../../anti-abuse/anti-abuse.service";
import { AntiAbuseKeyDeriver } from "../../anti-abuse/anti-abuse-key";
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
import { Issue416A01RequestFingerprint } from "./issue416-a01-request-fingerprint";
import { countUnresolvedA01 } from "./issue416-a01-count-unresolved";
import { assertA01TrustedLimiter } from "./issue416-a01-limiter-authority";

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

interface A01CommittedRow {
  readonly committed_session_id: string;
  readonly access_expires_at: Date;
  readonly absolute_expires_at: Date;
  readonly receipt_operation_id: string;
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

/** Internal A01-only MAC, after actual password and SQL challenge checks. */
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

/** Dormant auth-owned A01 issuer; no Nest route/module registration.
 * W33 SQL, U1 custody and independent PG17 authorization must be attested
 * before connecting it to real Staff Auth or removing old writer grants.
 */
@Injectable()
export class Issue416A01ProtectedLogin {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly fingerprints: Issue416A01RequestFingerprint,
    private readonly identifierKeys: AntiAbuseKeyDeriver,
  ) {}

  async login(
    email: string,
    submittedPassword: string,
    identifierReservation: AntiAbusePendingReservation,
    request: ApiRequest,
  ): Promise<StaffAuthTokens> {
    if (typeof submittedPassword !== "string") throw new AntiAbuseUnavailableError();
    assertA01TrustedLimiter(email, identifierReservation, this.identifierKeys);

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
    const requestFingerprint = this.fingerprints.derive(
      request, email, operationId, identifierReservation.id,
      identifierReservation.key.keyHash,
    );

    // A durable pre-domain operation binding MUST commit independently before
    // password work. A failed/ambiguous COMMIT is never automatically retried.
    await inPostgresTransaction(this.pool, async (transaction) => {
      const bound = await transaction.query<{ readonly a01_bind_limiter: string }>(
        `SELECT auth_proof_private.a01_bind_limiter(
           $1::text, $2::uuid, $3::uuid, $4::bytea, $5::text
         )`,
        [
          audience,
          operationId,
          identifierReservation.id,
          requestFingerprint,
          identifierReservation.key.keyHash,
        ],
      );
      if (bound.rows.length !== 1 ||
          bound.rows[0]?.a01_bind_limiter !== identifierReservation.id) {
        throw new AntiAbuseUnavailableError();
      }
    });

    try {
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
    let committed: LoginSessionRow;
    try {
      const executedSession = await inPostgresTransaction(this.pool, async (transaction) => {
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
           $7::text,$8::text,$9::uuid,$10::bytea
         )`,
        [
          audience, operationId, user.id, phcDigest, sessionId, refreshId,
          accessHash, refreshHash, identifierReservation.id, requestFingerprint,
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
           $1::uuid,$2::bytea,$3::bytea,$4::text,$5::uuid,$6::uuid,
           $7::bytea,$8::uuid,$9::uuid,$10::text,$11::text,
           $12::uuid,$13::bytea
         )`,
        [
          row.challenge_id, row.proof_bytes, mac, audience, operationId,
          user.id, phcDigest, sessionId, refreshId, accessHash,
          refreshHash, identifierReservation.id, requestFingerprint,
        ],
      );
      const result = executed.rows[0];
      if (
        !result || executed.rows.length !== 1 ||
        result.committed_session_id !== sessionId ||
        result.receipt_operation_id !== operationId ||
        !(result.access_expires_at instanceof Date) ||
        !(result.absolute_expires_at instanceof Date)
      ) throw new AntiAbuseUnavailableError();
      return result;
      });
      committed = {
        id: executedSession.committed_session_id,
        access_expires_at: executedSession.access_expires_at,
        absolute_expires_at: executedSession.absolute_expires_at,
        refresh_cookie_max_age_seconds: Math.max(0, Math.floor(
          (executedSession.absolute_expires_at.getTime() - Date.now()) / 1000,
        )),
      };
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

    // W33's signed execute commits the session, audit, immutable receipt and
    // IGNORED reservation atomically. No post-COMMIT finalizer can lose tokens.
    return staffAuthTokenResult(committed, rawAccess, rawRefresh);
    } catch (error) {
      try {
        await countUnresolvedA01(
          this.pool, audience, operationId, identifierReservation.id,
        );
      } catch {
        throw new AntiAbuseUnavailableError();
      }
      throw error;
    }
  }
}
