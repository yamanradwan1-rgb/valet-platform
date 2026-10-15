import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CancelCheckInRequest } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { createCancelCheckInCommandExecutor } from "../valet-sessions/cancel-check-in-command";
import { createCancelCheckInStatusQuery } from "../valet-sessions/cancel-check-in-status-query";
import type { CancelCheckInAuthorityInput } from "../valet-sessions/cancel-check-in-authorization";

@Injectable()
export class CancelCheckInService {
  private readonly cancelCommand;
  private readonly statusQuery;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {
    this.cancelCommand = createCancelCheckInCommandExecutor(pool);
    this.statusQuery = createCancelCheckInStatusQuery(pool);
  }

  private async credential(userId: string, authorization?: string) {
    const context = await this.sessions.resolve(authorization);
    if (context.userId !== userId) throw new UnauthorizedException();
    return context;
  }

  async cancel(
    input: CancelCheckInAuthorityInput & CancelCheckInRequest,
    authorization?: string,
  ) {
    return this.cancelCommand(input,
      await this.credential(input.authenticatedUserId, authorization));
  }

  async status(input: CancelCheckInAuthorityInput, authorization?: string) {
    return this.statusQuery(input,
      await this.credential(input.authenticatedUserId, authorization));
  }
}
