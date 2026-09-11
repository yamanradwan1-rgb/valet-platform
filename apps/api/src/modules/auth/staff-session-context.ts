import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  accessBearerPattern,
  accessTokenPattern,
  staffCredentialHash,
} from "./staff-auth-credential";
import {
  type StaffPrincipal,
  type StaffPrincipalResolver,
} from "./staff-principal";

export const STAFF_SESSION_CONTEXT_RESOLVER = Symbol(
  "STAFF_SESSION_CONTEXT_RESOLVER",
);

export interface StaffSessionContext {
  readonly accessTokenHash: string;
  readonly createdAt: Date;
  readonly staffAuthSessionId: string;
  readonly userId: string;
}

export interface StaffSessionContextResolver {
  resolve(authorization: string | undefined): Promise<StaffSessionContext>;
}

interface StaffSessionContextRow {
  readonly created_at: Date;
  readonly id: string;
  readonly user_id: string;
}

@Injectable()
export class DatabaseStaffSessionContextResolver implements StaffSessionContextResolver {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async resolve(
    authorization: string | undefined,
  ): Promise<StaffSessionContext> {
    const match =
      typeof authorization === "string"
        ? accessBearerPattern.exec(authorization)
        : null;
    const accessToken = match?.[1];
    if (accessToken === undefined || !accessTokenPattern.test(accessToken)) {
      throw new UnauthorizedException();
    }
    const accessTokenHash = staffCredentialHash("access", accessToken);
    const result = await this.pool.query<StaffSessionContextRow>(
      `SELECT session.id, session.user_id, session.created_at
       FROM staff_auth_sessions AS session
       INNER JOIN users AS staff_user ON staff_user.id = session.user_id
       WHERE session.current_access_token_hash = $1
         AND session.revoked_at IS NULL
         AND clock_timestamp() < session.access_expires_at
         AND clock_timestamp() < session.absolute_expires_at
         AND staff_user.status = 'ACTIVE'`,
      [accessTokenHash],
    );
    const row = result.rows[0];
    if (result.rowCount !== 1 || row === undefined) {
      throw new UnauthorizedException();
    }
    return {
      accessTokenHash,
      createdAt: row.created_at,
      staffAuthSessionId: row.id,
      userId: row.user_id,
    };
  }
}

@Injectable()
export class DatabaseStaffPrincipalResolver implements StaffPrincipalResolver {
  private readonly sessionContextResolver: StaffSessionContextResolver;

  constructor(
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    resolverOrPool: StaffSessionContextResolver | PostgresPool,
  ) {
    this.sessionContextResolver =
      "resolve" in resolverOrPool
        ? resolverOrPool
        : new DatabaseStaffSessionContextResolver(resolverOrPool);
  }

  async resolve(authorization: string | undefined): Promise<StaffPrincipal> {
    const context = await this.sessionContextResolver.resolve(authorization);
    return { userId: context.userId };
  }
}
