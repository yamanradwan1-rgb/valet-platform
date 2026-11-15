import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { Inject, Injectable } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  AntiAbuseKeyDeriver,
  type AntiAbuseKey,
  type AntiAbuseScope,
} from "./anti-abuse-key";
import {
  signS04Counted,
  signS04Finalize,
  signS04Reservation,
} from "./s04-signed-sql-proof";
import { antiAbuseRetryAfter } from "./anti-abuse-retry-after";

export type AntiAbuseReservationState = "COUNTED" | "IGNORED";

export interface AntiAbusePendingReservation {
  readonly id: string;
  readonly key: AntiAbuseKey;
  readonly authenticatedAddressKey?: never;
}
export type AntiAbuseReservation =
  | AntiAbusePendingReservation
  | {
      readonly id?: never;
      readonly key: AntiAbuseKey;
      readonly authenticatedAddressKey: AntiAbuseKey;
    };

export type AntiAbuseDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfter: number };

export type AntiAbuseReservationDecision =
  | {
      readonly allowed: true;
      readonly reservation: AntiAbusePendingReservation;
    }
  | { readonly allowed: false; readonly retryAfter: number };

interface CountRow {
  readonly count: number;
}

interface DecisionTimeRow {
  readonly decision_at: string;
}

interface IdRow {
  readonly id: string;
}

export class AntiAbuseUnavailableError extends Error {
  readonly code = "ANTI_ABUSE_UNAVAILABLE";

  constructor() {
    super("Service temporarily unavailable.");
    this.name = "AntiAbuseUnavailableError";
  }
}

export class AntiAbuseRateLimitError extends Error {
  constructor(
    readonly code:
      | "GUEST_ACCESS_RATE_LIMITED"
      | "STAFF_AUTHENTICATION_RATE_LIMITED"
      | "SHIFT_PRESENCE_RATE_LIMITED"
      | "STAFF_ACTIVATION_RATE_LIMITED",
    readonly retryAfter: number,
  ) {
    super("Too many requests. Try again later.");
    this.name = "AntiAbuseRateLimitError";
  }
}

@Injectable()
export class AntiAbuseService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly keys: AntiAbuseKeyDeriver,
  ) {}

  key(scope: AntiAbuseScope, value: string): AntiAbuseKey {
    try {
      return this.keys.derive(scope, value);
    } catch {
      throw new AntiAbuseUnavailableError();
    }
  }

  async transaction<T>(
    action: (transaction: PostgresTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await inPostgresTransaction(this.pool, action);
    } catch (error) {
      if (
        error instanceof AntiAbuseRateLimitError ||
        error instanceof AntiAbuseUnavailableError
      )
        throw error;
      throw new AntiAbuseUnavailableError();
    }
  }

  private async lock(
    transaction: PostgresTransaction,
    key: AntiAbuseKey,
  ): Promise<void> {
    await transaction.query("SET LOCAL lock_timeout = '2s'");
    await transaction.query("SELECT pg_advisory_xact_lock($1, $2)", [
      key.lockHigh,
      key.lockLow,
    ]);
  }

  private async currentCount(
    transaction: PostgresTransaction,
    key: AntiAbuseKey,
    decisionAt: string,
  ): Promise<number> {
    const result = await transaction.query<CountRow>(
      `SELECT count(*)::integer AS count
       FROM anti_abuse_events
       WHERE scope = $1
         AND key_hash = $2
         AND state IN ('PENDING', 'COUNTED')
         AND occurred_at > $3::timestamptz - INTERVAL '15 minutes'`,
      [key.scope, key.keyHash, decisionAt],
    );
    const count = result.rows[0]?.count;
    if (count === undefined) throw new AntiAbuseUnavailableError();
    return count;
  }

  private async decision(
    transaction: PostgresTransaction,
    key: AntiAbuseKey,
    threshold: number,
  ): Promise<AntiAbuseDecision> {
    await this.lock(transaction, key);
    const decisionTime = await transaction.query<DecisionTimeRow>(
      "SELECT clock_timestamp()::text AS decision_at",
    );
    const decisionAt = decisionTime.rows[0]?.decision_at;
    if (decisionAt === undefined) throw new AntiAbuseUnavailableError();
    const count = await this.currentCount(transaction, key, decisionAt);
    if (count < threshold) return { allowed: true };
    const retryAfter = await antiAbuseRetryAfter(
      transaction, key, decisionAt, count - threshold,
    );
    if (retryAfter === undefined) throw new AntiAbuseUnavailableError();
    return { allowed: false, retryAfter };
  }

  async count(
    key: AntiAbuseKey,
    threshold: number,
  ): Promise<AntiAbuseDecision> {
    const result = await this.transaction((transaction) =>
      this.countInTransaction(transaction, key, threshold),
    );

    return result;
  }

  async countInTransaction(
    transaction: PostgresTransaction,
    key: AntiAbuseKey,
    threshold: number,
  ): Promise<AntiAbuseDecision> {
    const decision = await this.decision(transaction, key, threshold);
    if (!decision.allowed) return decision;
    const proof = signS04Counted(key);
    await transaction.query(
      "SELECT public.s04_counted($1,$2,$3::uuid,$4::bigint,$5)",
      [key.scope, key.keyHash, proof.nonce, proof.expiresMs, proof.mac],
    );
    return decision;
  }

  async blockerInTransaction(
    transaction: PostgresTransaction,
    key: AntiAbuseKey,
    threshold: number,
  ): Promise<number | undefined> {
    const decision = await this.decision(transaction, key, threshold);
    return decision.allowed ? undefined : decision.retryAfter;
  }

  async reserve(
    key: AntiAbuseKey,
    threshold: number,
  ): Promise<AntiAbuseReservationDecision> {
    const result = await this.transaction(async (transaction) => {
      const decision = await this.decision(transaction, key, threshold);
      if (!decision.allowed) return decision;
      const proof = signS04Reservation(key);
      const inserted = await transaction.query<IdRow>(
        "SELECT public.s04_reserve($1,$2,$3::uuid,$4::bigint,$5) AS id",
        [key.scope, key.keyHash, proof.nonce, proof.expiresMs, proof.mac],
      );
      const id = inserted.rows[0]?.id;
      if (id === undefined) throw new AntiAbuseUnavailableError();
      return { allowed: true as const, reservation: { id, key } };
    });

    return result;
  }

  async blocker(
    key: AntiAbuseKey,
    threshold: number,
  ): Promise<number | undefined> {
    return await this.transaction((transaction) =>
      this.blockerInTransaction(transaction, key, threshold),
    );
  }

  async finalize(
    reservation: AntiAbuseReservation,
    state: AntiAbuseReservationState,
  ): Promise<void> {
    await this.transaction(async (transaction) => {
      await this.finalizeInTransaction(transaction, reservation, state);
    });
  }

  async finalizeInTransaction(
    transaction: PostgresTransaction,
    reservation: AntiAbuseReservation,
    state: AntiAbuseReservationState,
  ): Promise<void> {
    if (reservation.authenticatedAddressKey !== undefined) {
      if (state === "COUNTED") {
        const decision = await this.countInTransaction(
          transaction,
          reservation.authenticatedAddressKey,
          60,
        );
        if (!decision.allowed)
          throw new AntiAbuseRateLimitError(
            "GUEST_ACCESS_RATE_LIMITED",
            decision.retryAfter,
          );
      }
      return;
    }
    const proof = signS04Finalize(reservation.id, reservation.key, state);
    const updated = await transaction.query<{ updated: number }>(
      "SELECT public.s04_finalize($1::uuid,$2,$3,$4,$5::uuid,$6::bigint,$7) AS updated",
      [
        reservation.id, reservation.key.scope, reservation.key.keyHash, state,
        proof.nonce, proof.expiresMs, proof.mac,
      ],
    );
    if (updated.rows[0]?.updated !== 1) throw new AntiAbuseUnavailableError();
  }
}
