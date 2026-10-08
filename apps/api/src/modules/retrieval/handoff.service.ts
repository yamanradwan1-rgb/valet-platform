import { inPostgresTransaction } from "../../common/database/postgres-transaction";
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
import type { GuestCredentialInput } from "../guest-access/guest-credential";
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
    credential: GuestCredentialInput,
    method: HandoffStandardMethod,
    rotate: boolean,
  ) {
    const outcome = await this.inTransaction(async (transaction) => {
      const resolved =
        await this.guestAccess.resolveAndLockCredentialInTransaction(
          transaction,
          credential,
        );
      if (resolved === undefined) {
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
          resolved.session,
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
    return inPostgresTransaction(this.pool, operation);
  }
}
