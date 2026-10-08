import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  AntiAbuseService,
  AntiAbuseUnavailableError,
  AntiAbuseRateLimitError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import { GuestAccessService } from "../guest-access/guest-access.service";
import type { GuestCredentialInput } from "../guest-access/guest-credential";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { inPaymentTransaction } from "./payment-transaction";
import { authorizeStaffPaymentProjection } from "./payment-projection-authorization";
import { loadSafePaymentProjection } from "./payment-projection-query";

@Injectable()
export class PaymentProjectionService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
    private readonly guestAccess: GuestAccessService,
  ) {}

  staff(authenticatedUserId: string, valetSessionId: string) {
    return inPaymentTransaction(this.pool, async (transaction) => {
      const scope = await authorizeStaffPaymentProjection(
        transaction,
        authenticatedUserId,
        valetSessionId,
      );
      return loadSafePaymentProjection(transaction, scope);
    });
  }

  async guest(
    reservation: AntiAbuseReservation,
    credential: GuestCredentialInput,
    valetSessionId: string,
  ) {
    const result = await inPaymentTransaction(
      this.pool,
      async (transaction) => {
        const resolved =
          await this.guestAccess.resolveAndLockCredentialInTransaction(
            transaction,
            credential,
            true,
          );
        if (
          resolved === undefined ||
          resolved.session.valetSessionId !== valetSessionId
        ) {
          await this.finalize(transaction, reservation, "COUNTED");
          return null;
        }
        const projection = await loadSafePaymentProjection(
          transaction,
          resolved.session,
        );
        await this.finalize(transaction, reservation, "IGNORED");
        return projection;
      },
    );
    if (result === null) throw new GuestAccessError("GUEST_ACCESS_INVALID");
    return result;
  }

  private async finalize(
    transaction: Parameters<AntiAbuseService["finalizeInTransaction"]>[0],
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
}
