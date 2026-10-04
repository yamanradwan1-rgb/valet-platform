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

export type AntiAbuseReservationState = "COUNTED" | "IGNORED";

export interface AntiAbuseReservation {
  readonly id: string;
  readonly key: AntiAbuseKey;
}

export type AntiAbuseDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfter: number };

export type AntiAbuseReservationDecision =
  | { readonly allowed: true; readonly reservation: AntiAbuseReservation }
  | { readonly allowed: false; readonly retryAfter: number };

interface CountRow {
  readonly count: number;
}

interface DecisionTimeRow {
  readonly decision_at: string;
}

interface RetryRow {
  readonly retry_after: number;
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

async function rollback(transaction: PostgresTransaction): Promise<void> {
  try {
    await transaction.query("ROLLBACK");
  } catch {
    // Preserve the non-disclosing unavailable result.
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
    let transaction: PostgresTransaction | undefined;
    try {
      transaction = await this.pool.connect();
      await transaction.query("BEGIN");
      await transaction.query("SET LOCAL lock_timeout = '2s'");
      const result = await action(transaction);
      await transaction.query("COMMIT");
      return result;
    } catch (error) {
      if (transaction !== undefined) await rollback(transaction);
      if (
        error instanceof AntiAbuseRateLimitError ||
        error instanceof AntiAbuseUnavailableError
      ) {
        throw error;
      }
      throw new AntiAbuseUnavailableError();
    } finally {
      transaction?.release();
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

  private async retryAfter(
    transaction: PostgresTransaction,
    key: AntiAbuseKey,
    decisionAt: string,
    offset: number,
  ): Promise<number> {
    const result = await transaction.query<RetryRow>(
      `SELECT GREATEST(
                1,
                LEAST(
                  900,
                  CEIL(EXTRACT(EPOCH FROM (
                    occurred_at + INTERVAL '15 minutes' - $3::timestamptz
                  )))::integer
                )
              ) AS retry_after
       FROM anti_abuse_events
       WHERE scope = $1
         AND key_hash = $2
         AND state IN ('PENDING', 'COUNTED')
         AND occurred_at > $3::timestamptz - INTERVAL '15 minutes'
       ORDER BY occurred_at ASC
       OFFSET $4
       LIMIT 1`,
      [key.scope, key.keyHash, decisionAt, offset],
    );
    const retryAfter = result.rows[0]?.retry_after;
    if (retryAfter === undefined) throw new AntiAbuseUnavailableError();
    return retryAfter;
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
    return {
      allowed: false,
      retryAfter: await this.retryAfter(
        transaction,
        key,
        decisionAt,
        count - threshold,
      ),
    };
  }

  async count(
    key: AntiAbuseKey,
    threshold: number,
  ): Promise<AntiAbuseDecision> {
    const result = await this.transaction((transaction) =>
      this.countInTransaction(transaction, key, threshold),
    );
    await this.cleanup();
    return result;
  }

  async countInTransaction(
    transaction: PostgresTransaction,
    key: AntiAbuseKey,
    threshold: number,
  ): Promise<AntiAbuseDecision> {
    const decision = await this.decision(transaction, key, threshold);
    if (!decision.allowed) return decision;
    await transaction.query(
      `INSERT INTO anti_abuse_events (scope, key_hash, state)
       VALUES ($1, $2, 'COUNTED')`,
      [key.scope, key.keyHash],
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
      const inserted = await transaction.query<IdRow>(
        `INSERT INTO anti_abuse_events (scope, key_hash, state)
         VALUES ($1, $2, 'PENDING')
         RETURNING id::text`,
        [key.scope, key.keyHash],
      );
      const id = inserted.rows[0]?.id;
      if (id === undefined) throw new AntiAbuseUnavailableError();
      return { allowed: true as const, reservation: { id, key } };
    });
    await this.cleanup();
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
    await this.cleanup();
  }

  async finalizeInTransaction(
    transaction: PostgresTransaction,
    reservation: AntiAbuseReservation,
    state: AntiAbuseReservationState,
  ): Promise<void> {
    const updated = await transaction.query(
      `UPDATE anti_abuse_events
       SET state = $1
       WHERE id = $2
         AND scope = $3
         AND key_hash = $4
         AND state = 'PENDING'`,
      [state, reservation.id, reservation.key.scope, reservation.key.keyHash],
    );
    if (updated.rowCount !== 1) throw new AntiAbuseUnavailableError();
  }

  async cleanup(): Promise<void> {
    try {
      await this.pool.query("SELECT cleanup_expired_anti_abuse_events()");
    } catch {
      // Cleanup is retention maintenance; current-window enforcement stays authoritative.
    }
  }
}
