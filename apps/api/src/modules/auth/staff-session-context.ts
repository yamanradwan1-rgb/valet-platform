import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  accessBearerPattern,
  accessTokenPattern,
} from "./staff-auth-credential";
import { resolveStaffSessionWithBearer } from "./staff-session-lock";
import {
  type StaffPrincipal,
  type StaffPrincipalResolver,
} from "./staff-principal";

export const STAFF_SESSION_CONTEXT_RESOLVER = Symbol(
  "STAFF_SESSION_CONTEXT_RESOLVER",
);

export interface StaffSessionContext {
  readonly createdAt: Date;
  readonly rawAccessToken?: string;
  readonly staffAuthSessionId: string;
  readonly userId: string;
}

export interface StaffSessionContextResolver {
  resolve(authorization: string | undefined): Promise<StaffSessionContext>;
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
    const row = await resolveStaffSessionWithBearer(this.pool, accessToken);
    if (row === undefined) throw new UnauthorizedException();
    const context = {
      createdAt: row.created_at,
      staffAuthSessionId: row.id,
      userId: row.user_id,
    } as StaffSessionContext;
    Object.defineProperty(context, "rawAccessToken", {
      configurable: false,
      enumerable: false,
      value: accessToken,
      writable: false,
    });
    return context;
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
