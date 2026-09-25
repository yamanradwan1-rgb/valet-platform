import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../../common/database/runtime-database.module";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContext,
  type StaffSessionContextResolver,
} from "../staff-session-context";
import { localMfaBypassEnabled } from "./local-mfa-bypass";
import { MfaStepUpRequiredError } from "./mfa-errors";
import { lockAndRecheckMfaSession } from "./mfa-session-repository";

const maxAssuranceMs = 8 * 60 * 60 * 1000;
const inactivityMs = 30 * 60 * 1000;
const sensitiveFreshnessMs = 5 * 60 * 1000;

export type MfaAssuranceResult =
  | "NO_MFA_ASSURANCE"
  | "MFA_MAX_AGE_EXPIRED"
  | "ADMIN_INACTIVITY_EXPIRED"
  | "SENSITIVE_FRESHNESS_EXPIRED"
  | "ASSURANCE_VALID";

export interface MfaAssuranceSnapshot {
  readonly factorCurrent: boolean;
  readonly lastAdminActivityAt: Date | null;
  readonly mfaAuthenticatedAt: Date | null;
  readonly mfaFactorId: string | null;
}

export function evaluateMfaAssurance(
  snapshot: MfaAssuranceSnapshot,
  now: Date,
  sensitive: boolean,
): MfaAssuranceResult {
  const authenticatedAt = snapshot.mfaAuthenticatedAt;
  const activityAt = snapshot.lastAdminActivityAt;
  if (
    authenticatedAt === null ||
    activityAt === null ||
    snapshot.mfaFactorId === null ||
    !snapshot.factorCurrent
  ) {
    return "NO_MFA_ASSURANCE";
  }
  const age = now.getTime() - authenticatedAt.getTime();
  if (age < 0 || age >= maxAssuranceMs) return "MFA_MAX_AGE_EXPIRED";
  const idle = now.getTime() - activityAt.getTime();
  if (idle < 0 || idle >= inactivityMs) return "ADMIN_INACTIVITY_EXPIRED";
  if (sensitive && age > sensitiveFreshnessMs) {
    return "SENSITIVE_FRESHNESS_EXPIRED";
  }
  return "ASSURANCE_VALID";
}

interface AssuranceRow {
  readonly factor_current: boolean;
  readonly last_admin_activity_at: Date | null;
  readonly mfa_authenticated_at: Date | null;
  readonly mfa_factor_id: string | null;
  readonly now: Date;
}

async function readAssurance(
  queryable: Pick<PostgresPool, "query"> | PostgresTransaction,
  context: StaffSessionContext,
): Promise<{ readonly now: Date; readonly snapshot: MfaAssuranceSnapshot }> {
  const result = await queryable.query<AssuranceRow>(
    `WITH decision AS (SELECT clock_timestamp() AS now)
     SELECT session.mfa_authenticated_at, session.mfa_factor_id,
            session.last_admin_activity_at, decision.now,
            EXISTS (
              SELECT 1 FROM user_mfa_totp_factors AS factor
              WHERE factor.id = session.mfa_factor_id
                AND factor.user_id = session.user_id
                AND factor.state = 'ACTIVE'
            ) AS factor_current
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id = session.user_id
     CROSS JOIN decision
     WHERE session.id = $1 AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.revoked_at IS NULL
       AND decision.now < session.access_expires_at
       AND decision.now < session.absolute_expires_at
       AND staff_user.status = 'ACTIVE'`,
    [context.staffAuthSessionId, context.userId, context.accessTokenHash],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new UnauthorizedException();
  }
  return {
    now: row.now,
    snapshot: {
      factorCurrent: row.factor_current,
      lastAdminActivityAt: row.last_admin_activity_at,
      mfaAuthenticatedAt: row.mfa_authenticated_at,
      mfaFactorId: row.mfa_factor_id,
    },
  };
}

export async function requireMfaAssuranceInTransaction(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  options: { readonly sensitive: boolean } = { sensitive: false },
): Promise<void> {
  const session = await lockAndRecheckMfaSession(transaction, context);
  if (localMfaBypassEnabled()) return;
  const factorCurrent =
    session.mfa_factor_id !== null &&
    (
      await transaction.query<{ readonly current: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM user_mfa_totp_factors AS factor
           WHERE factor.id = $1 AND factor.user_id = $2
             AND factor.state = 'ACTIVE'
         ) AS current`,
        [session.mfa_factor_id, session.user_id],
      )
    ).rows[0]?.current === true;
  const result = evaluateMfaAssurance(
    {
      factorCurrent,
      lastAdminActivityAt: session.last_admin_activity_at,
      mfaAuthenticatedAt: session.mfa_authenticated_at,
      mfaFactorId: session.mfa_factor_id,
    },
    session.now,
    options.sensitive,
  );
  if (result !== "ASSURANCE_VALID") throw new MfaStepUpRequiredError();
}

export async function recordAdminActivityInTransaction(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<void> {
  if (localMfaBypassEnabled()) {
    await lockAndRecheckMfaSession(transaction, context);
    return;
  }
  const clock = await transaction.query<{ readonly now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const now = clock.rows[0]?.now;
  if (now === undefined) throw new MfaStepUpRequiredError();
  const updated = await transaction.query(
    `UPDATE staff_auth_sessions AS session
     SET last_admin_activity_at = $4::timestamptz
     FROM users AS staff_user, user_mfa_totp_factors AS factor
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.revoked_at IS NULL
       AND staff_user.id = session.user_id
       AND staff_user.status = 'ACTIVE'
       AND factor.id = session.mfa_factor_id
       AND factor.user_id = session.user_id
       AND factor.state = 'ACTIVE'
       AND session.mfa_authenticated_at IS NOT NULL
       AND session.last_admin_activity_at IS NOT NULL
       AND $4::timestamptz < session.access_expires_at
       AND $4::timestamptz < session.absolute_expires_at
       AND $4::timestamptz < session.mfa_authenticated_at + INTERVAL '8 hours'
       AND $4::timestamptz < session.last_admin_activity_at + INTERVAL '30 minutes'`,
    [context.staffAuthSessionId, context.userId, context.accessTokenHash, now],
  );
  if (updated.rowCount !== 1) throw new MfaStepUpRequiredError();
}

@Injectable()
export class MfaAssurancePolicy {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  async requireInTransaction(
    transaction: PostgresTransaction,
    context: StaffSessionContext,
    options: { readonly sensitive: boolean } = { sensitive: false },
  ): Promise<void> {
    await requireMfaAssuranceInTransaction(transaction, context, options);
  }

  async require(
    authorization: string | undefined,
    options: { readonly sensitive: boolean } = { sensitive: false },
  ): Promise<StaffSessionContext> {
    const context = await this.sessions.resolve(authorization);
    const current = await readAssurance(this.pool, context);
    if (localMfaBypassEnabled()) return context;
    if (
      evaluateMfaAssurance(current.snapshot, current.now, options.sensitive) !==
      "ASSURANCE_VALID"
    ) {
      throw new MfaStepUpRequiredError();
    }
    return context;
  }

  async assess(
    authorization: string | undefined,
    options: { readonly sensitive: boolean } = { sensitive: false },
  ): Promise<MfaAssuranceResult> {
    const context = await this.sessions.resolve(authorization);
    const current = await readAssurance(this.pool, context);
    if (localMfaBypassEnabled()) return "ASSURANCE_VALID";
    return evaluateMfaAssurance(
      current.snapshot,
      current.now,
      options.sensitive,
    );
  }
}
