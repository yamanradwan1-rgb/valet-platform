import { Inject, Injectable } from "@nestjs/common";
import type { GuestInformationResponse } from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  AntiAbuseRateLimitError,
  AntiAbuseService,
  AntiAbuseUnavailableError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import {
  GuestInformationScopeUnavailableError,
  readGuestInformationProjection,
} from "../management/guest-information-public-projection";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { GuestAccessService } from "./guest-access.service";
import type { GuestCredentialInput } from "./guest-credential";

@Injectable()
export class GuestInformationService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
    private readonly guestAccess: GuestAccessService,
  ) {}

  async read(
    reservation: AntiAbuseReservation,
    credential: GuestCredentialInput,
    locale: "en" | "ar",
  ): Promise<GuestInformationResponse> {
    // Authorization and projection share a transaction. The session lock
    // serializes this read with guest revocation and browser-context changes.
    const projection = await inPostgresTransaction(
      this.pool,
      async (transaction) => {
        const resolved =
          await this.guestAccess.resolveAndLockCredentialInTransaction(
            transaction,
            credential,
            true,
          );
        if (resolved === undefined) {
          await this.finalize(transaction, reservation, "COUNTED");
          return undefined;
        }

        let result: GuestInformationResponse;
        try {
          result = await readGuestInformationProjection(transaction, {
            organizationId: resolved.session.organizationId,
            locationId: resolved.session.locationId,
            locale,
          });
        } catch (error) {
          if (!(error instanceof GuestInformationScopeUnavailableError)) {
            throw error;
          }
          // A Location/Organization deactivated after admission must be
          // concealed just like a revoked Guest credential.
          await this.finalize(transaction, reservation, "COUNTED");
          return undefined;
        }
        await this.finalize(transaction, reservation, "IGNORED");
        return result;
      },
    );
    if (projection === undefined) {
      throw new GuestAccessError("GUEST_ACCESS_INVALID");
    }
    return projection;
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
}
