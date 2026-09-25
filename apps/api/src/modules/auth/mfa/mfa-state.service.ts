import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../../common/database/postgres";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../../common/database/runtime-database.module";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../staff-session-context";
import { localMfaBypassEnabled } from "./local-mfa-bypass";
import { MfaAssurancePolicy } from "./mfa-assurance-policy";
import { lockCurrentFactor } from "./mfa-factor-repository";
import {
  lockAndRecheckMfaSession,
  requireCompanyAdminEligibility,
} from "./mfa-session-repository";

export type MfaSafeState =
  | "ENROLLMENT_REQUIRED"
  | "ENROLLMENT_PENDING"
  | "STEP_UP_REQUIRED"
  | "ASSURED";

@Injectable()
export class MfaStateService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
    private readonly assurance: MfaAssurancePolicy,
  ) {}

  async state(authorization: string | undefined): Promise<{ readonly state: MfaSafeState }> {
    const context = await this.sessions.resolve(authorization);
    const bypassEnabled = localMfaBypassEnabled();
    const factorState = await inPostgresTransaction(this.pool, async (transaction) => {
      const session = await lockAndRecheckMfaSession(transaction, context);
      await requireCompanyAdminEligibility(transaction, session.user_id);
      if (bypassEnabled) return "LOCAL_BYPASS" as const;
      return (await lockCurrentFactor(transaction, session.user_id))?.state;
    });
    if (factorState === "LOCAL_BYPASS") return { state: "ASSURED" };
    if (factorState === undefined) return { state: "ENROLLMENT_REQUIRED" };
    if (factorState === "PENDING") return { state: "ENROLLMENT_PENDING" };
    const result = await this.assurance.assess(authorization);
    return { state: result === "ASSURANCE_VALID" ? "ASSURED" : "STEP_UP_REQUIRED" };
  }
}
