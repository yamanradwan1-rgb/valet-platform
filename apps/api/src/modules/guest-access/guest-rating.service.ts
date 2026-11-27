import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { Inject, Injectable } from "@nestjs/common";
import type { GuestRatingScopedFeedbackRequest } from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import {
  AntiAbuseService,
  AntiAbuseUnavailableError,
  AntiAbuseRateLimitError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import {
  GuestFeedbackUnavailableError,
  GuestRatingError,
  submitGuestRating,
  type GuestRatingCommandResult,
} from "./guest-rating-command";
import { GuestAccessService } from "./guest-access.service";
import type { GuestCredentialInput } from "./guest-credential";

type GuestRatingOperationResult =
  | { readonly kind: "INVALID_ACCESS" }
  | {
      readonly error: GuestRatingError | ApiTransportValidationError;
      readonly kind: "INVALID_STATE";
    }
  | { readonly kind: "SUCCESS"; readonly rating: GuestRatingCommandResult };

type ScopedFeedback = Pick<
  GuestRatingScopedFeedbackRequest, "expectedValetSessionId" | "comment"
>;

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
    scoped?: ScopedFeedback,
  ) {
    const result = await this.inTransaction((transaction) =>
      this.executeInTransaction(transaction, reservation, credential, rating, scoped),
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
    scoped?: ScopedFeedback,
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
        scoped,
      );
      await this.finalize(transaction, reservation, "IGNORED");
      return { kind: "SUCCESS", rating: result };
    } catch (error) {
      if (error instanceof GuestAccessError) {
        await this.finalize(transaction, reservation, "COUNTED");
        return { kind: "INVALID_ACCESS" };
      }
      if (error instanceof GuestFeedbackUnavailableError) {
        await this.finalize(transaction, reservation, "IGNORED");
        return { error, kind: "INVALID_STATE" };
      }
      if (error instanceof ApiTransportValidationError) {
        await this.finalize(transaction, reservation, "COUNTED");
        return { error, kind: "INVALID_STATE" };
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
    } catch (error) {
      if (error instanceof AntiAbuseRateLimitError) throw error;
      throw new AntiAbuseUnavailableError();
    }
  }

  private async inTransaction<T>(
    operation: (transaction: PostgresTransaction) => Promise<T>,
  ): Promise<T> {
    return inPostgresTransaction(this.pool, operation);
  }
}
