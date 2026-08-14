import { Inject, Injectable } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  AntiAbuseService,
  AntiAbuseUnavailableError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import { GuestAccessService } from "../guest-access/guest-access.service";
import {
  GuestAccessError,
  type GuestSafeSession,
} from "../valet-sessions/guest-access-command";
import type { LockedGuestAccessSessionScope } from "../valet-sessions/guest-access-session-resolution";
import {
  cancelGuestRetrieval,
  GuestRetrievalCancellationError,
} from "./guest-retrieval-cancellation-command";
import {
  GuestRetrievalRequestError,
  requestGuestRetrieval,
} from "./guest-retrieval-request-command";

type GuestOperationResult =
  | { readonly kind: "INVALID_ACCESS" }
  | {
      readonly error:
        GuestRetrievalCancellationError | GuestRetrievalRequestError;
      readonly kind: "INVALID_STATE";
    }
  | { readonly kind: "SUCCESS"; readonly session: GuestSafeSession };

type GuestRetrievalOperation = (
  transaction: PostgresTransaction,
  session: LockedGuestAccessSessionScope,
) => Promise<LockedGuestAccessSessionScope>;

function guestSafeSession(session: GuestSafeSession): GuestSafeSession {
  return {
    state: session.state,
    valetSessionId: session.valetSessionId,
    vehicle: session.vehicle,
  };
}

@Injectable()
export class RetrievalService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
    private readonly guestAccess: GuestAccessService,
  ) {}

  async requestGuestRetrieval(
    reservation: AntiAbuseReservation,
    rawToken: string,
  ): Promise<GuestSafeSession> {
    return this.executeGuestOperation(
      reservation,
      rawToken,
      requestGuestRetrieval,
    );
  }

  async cancelGuestRetrieval(
    reservation: AntiAbuseReservation,
    rawToken: string,
  ): Promise<GuestSafeSession> {
    return this.executeGuestOperation(
      reservation,
      rawToken,
      cancelGuestRetrieval,
    );
  }

  private async executeGuestOperation(
    reservation: AntiAbuseReservation,
    rawToken: string,
    operation: GuestRetrievalOperation,
  ): Promise<GuestSafeSession> {
    const result = await this.inTransaction((transaction) =>
      this.executeInTransaction(transaction, reservation, rawToken, operation),
    );
    if (result.kind === "INVALID_ACCESS") {
      throw new GuestAccessError("GUEST_ACCESS_INVALID");
    }
    if (result.kind === "INVALID_STATE") throw result.error;
    return result.session;
  }

  private async executeInTransaction(
    transaction: PostgresTransaction,
    reservation: AntiAbuseReservation,
    rawToken: string,
    operation: GuestRetrievalOperation,
  ): Promise<GuestOperationResult> {
    const session = await this.guestAccess.resolveAndLockInTransaction(
      transaction,
      rawToken,
    );
    if (session === undefined) {
      await this.finalize(transaction, reservation, "COUNTED");
      return { kind: "INVALID_ACCESS" };
    }
    try {
      const result = await operation(transaction, session);
      await this.finalize(transaction, reservation, "IGNORED");
      return { kind: "SUCCESS", session: guestSafeSession(result) };
    } catch (error) {
      if (
        !(error instanceof GuestRetrievalRequestError) &&
        !(error instanceof GuestRetrievalCancellationError)
      ) {
        throw error;
      }
      await this.finalize(transaction, reservation, "IGNORED");
      return { error, kind: "INVALID_STATE" };
    }
  }

  private async finalize(
    transaction: PostgresTransaction,
    reservation: AntiAbuseReservation,
    state: "COUNTED" | "IGNORED",
  ): Promise<void> {
    try {
      await this.antiAbuse.finalizeInTransaction(
        transaction,
        reservation,
        state,
      );
    } catch {
      throw new AntiAbuseUnavailableError();
    }
  }

  private async inTransaction<T>(
    operation: (transaction: PostgresTransaction) => Promise<T>,
  ): Promise<T> {
    const transaction = await this.pool.connect();
    try {
      await transaction.query("BEGIN");
      const result = await operation(transaction);
      await transaction.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await transaction.query("ROLLBACK");
      } catch {
        // Preserve the operation error.
      }
      throw error;
    } finally {
      transaction.release();
    }
  }
}
