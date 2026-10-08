import { Inject, Injectable } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  AntiAbuseRateLimitError,
  AntiAbuseService,
  AntiAbuseUnavailableError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import { GuestAccessService } from "../guest-access/guest-access.service";
import type { GuestCredential } from "../guest-access/guest-credential";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { readGuestPushPublicConfig } from "./guest-push-public-config";
import type {
  GuestPushRegistrationRequest,
} from "./guest-push-registration-types";
import { GuestPushRegistrationUnavailableError } from "./guest-push-registration-types";

interface RegistrationRow {
  readonly registration_locale: string;
  readonly registration_state: string;
}

type RegistrationOutcome = "INVALID" | "SUCCESS" | "UNAVAILABLE";

@Injectable()
export class GuestPushRegistrationService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
    private readonly guestAccess: GuestAccessService,
  ) {}

  async config(reservation: AntiAbuseReservation, credential: GuestCredential) {
    const result = await inPostgresTransaction(this.pool, async (transaction) => {
      if (credential.kind !== "BROWSER_SESSION") {
        await this.finalize(transaction, reservation, "COUNTED");
        return { kind: "INVALID" } as const;
      }
      const resolved = await this.guestAccess.resolveAndLockCredentialInTransaction(
        transaction,
        credential,
        false,
      );
      if (resolved === undefined || resolved.scope !== "ACTIVE") {
        await this.finalize(transaction, reservation, "COUNTED");
        return { kind: "INVALID" } as const;
      }
      await this.finalize(transaction, reservation, "IGNORED");
      return {
        kind: "SUCCESS",
        policyEnabled: resolved.session.guestVehicleReadyNotificationEnabled === true,
      } as const;
    });
    if (result.kind === "INVALID") {
      throw new GuestAccessError("GUEST_ACCESS_INVALID");
    }
    return result.policyEnabled
      ? readGuestPushPublicConfig()
      : { enabled: false, publicKey: null };
  }

  async register(
    reservation: AntiAbuseReservation,
    credential: GuestCredential,
    input: GuestPushRegistrationRequest,
  ): Promise<void> {
    const outcome = await inPostgresTransaction<RegistrationOutcome>(
      this.pool,
      async (transaction) => {
      if (credential.kind !== "BROWSER_SESSION") {
        await this.finalize(transaction, reservation, "COUNTED");
        return "INVALID";
      }
      if (!readGuestPushPublicConfig().enabled) {
        await this.finalize(transaction, reservation, "IGNORED");
        return "UNAVAILABLE";
      }
      const result = await transaction.query<RegistrationRow>(
        `SELECT registration_state, registration_locale
         FROM public.guest_push_register_v1($1,$2,$3,$4,$5)`,
        [credential.secret, input.endpoint, input.p256dh, input.auth, input.locale],
      );
      if (result.rows[0]?.registration_state !== "ACTIVE") {
        await this.finalize(transaction, reservation, "COUNTED");
        return "INVALID";
      }
      await this.finalize(transaction, reservation, "IGNORED");
      return "SUCCESS";
    });
    if (outcome === "INVALID") throw new GuestAccessError("GUEST_ACCESS_INVALID");
    if (outcome === "UNAVAILABLE") throw new GuestPushRegistrationUnavailableError();
  }

  private async finalize(
    transaction: PostgresTransaction,
    reservation: AntiAbuseReservation,
    state: "COUNTED" | "IGNORED",
  ): Promise<void> {
    try {
      await this.antiAbuse.finalizeInTransaction(transaction, reservation, state);
    } catch (error) {
      if (error instanceof AntiAbuseRateLimitError) throw error;
      throw new AntiAbuseUnavailableError();
    }
  }
}
