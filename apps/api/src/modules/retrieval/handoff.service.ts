import { Inject, Injectable } from "@nestjs/common";
import type { HandoffStandardMethod } from "@valet/contracts";

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
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { createAbortHandoffExecutor } from "./abort-handoff-command";
import { HandoffError } from "./handoff-errors";
import { createInitiateHandoffExecutor } from "./initiate-handoff-command";
import { issueHandoffVerification } from "./issue-handoff-command";
import { createOverrideHandoffExecutor } from "./override-handoff-command";
import { createVerifyHandoffExecutor } from "./verify-handoff-command";

type GuestIssueOutcome =
  | { readonly error: Error; readonly kind: "ERROR" }
  | {
      readonly kind: "SUCCESS";
      readonly result: Awaited<ReturnType<typeof issueHandoffVerification>>;
    };

@Injectable()
export class HandoffService {
  private readonly abort;
  private readonly initiate;
  private readonly override;
  private readonly verify;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
    private readonly guestAccess: GuestAccessService,
  ) {
    this.abort = createAbortHandoffExecutor(pool);
    this.initiate = createInitiateHandoffExecutor(pool);
    this.override = createOverrideHandoffExecutor(pool);
    this.verify = createVerifyHandoffExecutor(pool, antiAbuse);
  }

  executeAbort(input: Parameters<typeof this.abort>[0]) {
    return this.abort(input);
  }

  executeInitiate(input: Parameters<typeof this.initiate>[0]) {
    return this.initiate(input);
  }

  executeOverride(input: Parameters<typeof this.override>[0]) {
    return this.override(input);
  }

  executeVerify(input: Parameters<typeof this.verify>[0]) {
    return this.verify(input);
  }

  async issueGuestMaterial(
    reservation: AntiAbuseReservation,
    rawToken: string,
    method: HandoffStandardMethod,
    rotate: boolean,
  ) {
    const outcome = await this.inTransaction(async (transaction) => {
      const guestSession = await this.guestAccess.resolveAndLockInTransaction(
        transaction,
        rawToken,
      );
      if (guestSession === undefined) {
        await this.finalize(transaction, reservation, "COUNTED");
        return {
          error: new GuestAccessError("GUEST_ACCESS_INVALID"),
          kind: "ERROR" as const,
        };
      }
      try {
        const result = await issueHandoffVerification(
          transaction,
          this.antiAbuse,
          guestSession,
          method,
          rotate,
        );
        await this.finalize(transaction, reservation, "IGNORED");
        return { kind: "SUCCESS" as const, result };
      } catch (error) {
        if (!(error instanceof HandoffError)) throw error;
        await this.finalize(transaction, reservation, "IGNORED");
        return { error, kind: "ERROR" as const };
      }
    });
    if (outcome.kind === "ERROR") throw outcome.error;
    return outcome.result;
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

  private async inTransaction(
    operation: (transaction: PostgresTransaction) => Promise<GuestIssueOutcome>,
  ): Promise<GuestIssueOutcome> {
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
        // Preserve the handoff error.
      }
      throw error;
    } finally {
      transaction.release();
    }
  }
}
