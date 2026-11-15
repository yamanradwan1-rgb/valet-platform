import { Injectable } from "@nestjs/common";

import type { PostgresTransaction } from "../../../common/database/postgres";
import type { AntiAbuseReservation } from "../../anti-abuse/anti-abuse.service";
import {
  AntiAbuseService,
  AntiAbuseUnavailableError,
} from "../../anti-abuse/anti-abuse.service";
import { MfaVerificationRateLimitedError } from "./mfa-errors";

const mfaAttemptThreshold = 5;

@Injectable()
export class MfaAntiAbuse {
  constructor(private readonly antiAbuse: AntiAbuseService) {}

  async reserveTotp(userId: string): Promise<AntiAbuseReservation> {
    return this.reserve("v1:mfa-totp-user", userId);
  }

  async reserveRecovery(userId: string): Promise<AntiAbuseReservation> {
    return this.reserve("v1:mfa-recovery-user", userId);
  }

  async success(reservation: AntiAbuseReservation): Promise<void> {
    await this.antiAbuse.finalize(reservation, "IGNORED");
  }

  async successInTransaction(
    transaction: PostgresTransaction,
    reservation: AntiAbuseReservation,
  ): Promise<void> {
    if (
      !reservation.id ||
      (reservation.key.scope !== "v1:mfa-totp-user" &&
        reservation.key.scope !== "v1:mfa-recovery-user")
    ) throw new AntiAbuseUnavailableError();
    // S04's purpose-restricted finalizer executes in the SAME MFA writer
    // transaction. Never fall back to mutable ordinary-runtime limiter rows.
    const done = await transaction.query<{ affected: number }>(
      "SELECT public.s04_mfa_success($1::uuid,$2::text,$3::text) AS affected",
      [reservation.id, reservation.key.scope, reservation.key.keyHash],
    );
    if (done.rowCount !== 1 || done.rows[0]?.affected !== 1) {
      throw new AntiAbuseUnavailableError();
    }
  }

  async failure(reservation: AntiAbuseReservation): Promise<void> {
    await this.antiAbuse.finalize(reservation, "COUNTED");
  }

  private async reserve(
    scope: "v1:mfa-recovery-user" | "v1:mfa-totp-user",
    userId: string,
  ): Promise<AntiAbuseReservation> {
    const key = this.antiAbuse.key(scope, userId);
    const decision = await this.antiAbuse.reserve(key, mfaAttemptThreshold);
    if (!decision.allowed) {
      throw new MfaVerificationRateLimitedError(decision.retryAfter);
    }
    return decision.reservation;
  }
}

export { AntiAbuseUnavailableError };
