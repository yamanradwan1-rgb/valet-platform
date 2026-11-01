import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { mergeMap, type Observable } from "rxjs";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  accessBearerPattern,
  staffCredentialHash,
} from "./staff-auth-credential";

interface StaffHttpRequest {
  readonly method?: string;
  readonly path?: string;
  readonly headers?: { readonly authorization?: string | string[] };
}

interface StaffHttpResponse {
  readonly headersSent?: boolean;
  readonly writableEnded?: boolean;
  readonly destroyed?: boolean;
}

/**
 * Best-effort emergency disable recheck before Nest serializes Staff GET data.
 * A response already writing to its socket cannot be withdrawn here.
 */
@Injectable()
export class StaffResponseUserRevalidationInterceptor implements NestInterceptor {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL)
    private readonly pool: PostgresPool,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<StaffHttpRequest>();
    const authorization = request.headers?.authorization;
    const token =
      typeof authorization === "string"
        ? accessBearerPattern.exec(authorization)?.[1]
        : undefined;
    if (
      request.method !== "GET" ||
      !request.path?.toLowerCase().startsWith("/v1/staff/") ||
      token === undefined
    )
      return next.handle();

    const response = context.switchToHttp().getResponse<StaffHttpResponse>();
    const tokenHash = staffCredentialHash("access", token);
    return next.handle().pipe(
      mergeMap(async (value: unknown) => {
        // Manual streaming controllers may have sent bytes already.
        if (
          !response.headersSent &&
          !response.writableEnded &&
          !response.destroyed
        ) {
          const result = await this.pool.query<{ readonly status: string }>(
            `SELECT actor.status::text AS status
             FROM staff_auth_sessions AS session
             INNER JOIN users AS actor ON actor.id = session.user_id
             WHERE session.current_access_token_hash = $1`,
            [tokenHash],
          );
          // Refresh may already have rotated the old token. Do not turn an
          // already-authorized in-flight GET into a false logout/refresh 401.
          // Global disable retains the current hash while revoking sessions.
          if (result.rows[0]?.status === "DISABLED") {
            throw new UnauthorizedException();
          }
        }
        return value;
      }),
    );
  }
}
