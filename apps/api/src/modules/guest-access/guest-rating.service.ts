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
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import {
  GuestRatingError,
  submitGuestRating,
  type GuestRatingCommandResult,
} from "./guest-rating-command";
import { GuestAccessService } from "./guest-access.service";
import type { GuestCredentialInput } from "./guest-credential";

type GuestRatingOperationResult =
  | { readonly kind: "INVALID_ACCESS" }
  | { readonly error: GuestRatingError; readonly kind: "INVALID_STATE" }
  | { readonly kind: "SUCCESS"; readonly rating: GuestRatingCommandResult };

@Injectable()
export class GuestRatingService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
    private readonly guestAccess: GuestAccessService,
  ) {}

  async submit(
    reservation: AntiAbuseReservation,
    credential: GuestCredentialInput,
    rating: number,
  ) {
    const result = await this.inTransaction((transaction) =>
      this.executeInTransaction(transaction, reservation, credential, rating),
    );
    if (result.kind === "INVALID_ACCESS") {
      throw new GuestAccessError("GUEST_ACCESS_INVALID");
    }
    if (result.kind === "INVALID_STATE") throw result.error;
    return {
      ratedAt: result.rating.ratedAt.toISOString(),
      rating: result.rating.rating,
      valetSessionId: result.rating.valetSessionId,
    };
  }

  private async executeInTransaction(
    transaction: PostgresTransaction,
    reservation: AntiAbuseReservation,
    credential: GuestCredentialInput,
    rating: number,
  ): Promise<GuestRatingOperationResult> {
    const resolved =
      await this.guestAccess.resolveAndLockCredentialInTransaction(
        transaction,
        credential,
        true,
      );
    if (resolved === undefined) {
      await this.finalize(transaction, reservation, "COUNTED");
      return { kind: "INVALID_ACCESS" };
    }
    try {
      const result = await submitGuestRating(
        transaction,
        credential,
        resolved.session,
        rating,
      );
      await this.finalize(transaction, reservation, "IGNORED");
      return { kind: "SUCCESS", rating: result };
    } catch (error) {
      if (error instanceof GuestAccessError) {
        await this.finalize(transaction, reservation, "COUNTED");
        return { kind: "INVALID_ACCESS" };
      }
      if (!(error instanceof GuestRatingError)) throw error;
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
