import { Inject, Injectable } from "@nestjs/common";
import type {
  StaffMfaDisableRequest,
  StaffMfaDisableResponse,
} from "@valet/contracts";
import type { PostgresPool } from "../../../common/database/postgres";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import {
  observeTransactionOutcome,
  type TransactionOutcome,
} from "../../../common/database/postgres-transaction-outcome";
import { RUNTIME_POSTGRES_POOL } from "../../../common/database/runtime-database.module";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../staff-session-context";
import { MfaAntiAbuse } from "./mfa-anti-abuse";
import { executeMfaDisable } from "./mfa-disable-command";
import { isMfaLockConflict, MfaOperationBusyError } from "./mfa-disable-errors";
import { readMfaDisableAvailability } from "./mfa-disable-policy";
import { MfaVerificationFailedError } from "./mfa-errors";

@Injectable()
export class MfaDisableService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
    private readonly antiAbuse: MfaAntiAbuse,
  ) {}

  async availability(authorization: string | undefined) {
    return readMfaDisableAvailability(
      this.pool,
      await this.sessions.resolve(authorization),
    );
  }

  async disable(
    authorization: string | undefined,
    input: StaffMfaDisableRequest,
  ): Promise<StaffMfaDisableResponse> {
    const context = await this.sessions.resolve(authorization);
    const reservation = await this.antiAbuse.reserveTotp(context.userId);
    const outcome: { value: TransactionOutcome } = { value: "UNAVAILABLE" };
    try {
      return await inPostgresTransaction(this.pool, async (tx) => {
        observeTransactionOutcome(tx, (value) => {
          outcome.value = value;
        });
        await tx.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
        return executeMfaDisable(
          tx,
          context,
          input,
          reservation,
          this.antiAbuse,
        );
      });
    } catch (error) {
      if (outcome.value === "ROLLED_BACK") {
        // Cleanup after all business locks are released; never mask the primary result.
        await (
          error instanceof MfaVerificationFailedError
            ? this.antiAbuse.failure(reservation)
            : this.antiAbuse.success(reservation)
        ).catch(() => {});
        if (isMfaLockConflict(error)) throw new MfaOperationBusyError();
      }
      if (
        outcome.value === "UNAVAILABLE" &&
        (error instanceof MfaOperationBusyError || isMfaLockConflict(error))
      ) {
        throw new Error("Account security transaction outcome unavailable.");
      }
      // An uncertain COMMIT leaves bounded PENDING admission state and never claims busy.
      throw error;
    }
  }
}
