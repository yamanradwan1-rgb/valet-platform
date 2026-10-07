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
import type { GuestCredentialInput } from "../guest-access/guest-credential";
import { StaffPushOperationalPolicy } from "../staff-push/staff-push-operational-policy";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import type { GuestSafeSession } from "../valet-sessions/guest-safe-session";
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
    ...(session.guestVehicleReadyNotificationEnabled === undefined
      ? {}
      : {
          guestVehicleReadyNotificationEnabled:
            session.guestVehicleReadyNotificationEnabled,
        }),
    readyAt: session.readyAt,
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
    private readonly pushPolicy: StaffPushOperationalPolicy,
  ) {}

  async requestGuestRetrieval(
    reservation: AntiAbuseReservation,
    credential: GuestCredentialInput,
  ): Promise<GuestSafeSession> {
    return this.executeGuestOperation(
      reservation,
      credential,
      (transaction, session) =>
        requestGuestRetrieval(
          transaction,
          session,
          this.pushPolicy.employeeRetrievalRequested,
          this.pushPolicy.creationEnabled,
        ),
    );
  }

  async cancelGuestRetrieval(
    reservation: AntiAbuseReservation,
    credential: GuestCredentialInput,
  ): Promise<GuestSafeSession> {
    return this.executeGuestOperation(
      reservation,
      credential,
      cancelGuestRetrieval,
    );
  }

  private async executeGuestOperation(
    reservation: AntiAbuseReservation,
    credential: GuestCredentialInput,
    operation: GuestRetrievalOperation,
  ): Promise<GuestSafeSession> {
    const result = await this.inTransaction((transaction) =>
      this.executeInTransaction(transaction, reservation, credential, operation),
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
    credential: GuestCredentialInput,
    operation: GuestRetrievalOperation,
  ): Promise<GuestOperationResult> {
    const resolved = await this.guestAccess.resolveAndLockCredentialInTransaction(
      transaction,
      credential,
    );
    if (resolved === undefined) {
      await this.finalize(transaction, reservation, "COUNTED");
      return { kind: "INVALID_ACCESS" };
    }
    try {
      const result = await operation(transaction, resolved.session);
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
