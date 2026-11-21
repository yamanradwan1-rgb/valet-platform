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
import { accessBearerPattern } from "./staff-auth-credential";
import { resolveStaffSessionWithBearer } from "./staff-session-lock";

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
    return next.handle().pipe(
      mergeMap(async (value: unknown) => {
        // Manual streaming controllers may have sent bytes already.
        if (
          !response.headersSent &&
          !response.writableEnded &&
          !response.destroyed
        ) {
          if (
            (await resolveStaffSessionWithBearer(this.pool, token)) ===
            undefined
          ) {
            throw new UnauthorizedException();
          }
        }
        return value;
      }),
    );
  }
}
