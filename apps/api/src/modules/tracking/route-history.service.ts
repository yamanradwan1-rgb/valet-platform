import { Inject, Injectable } from "@nestjs/common";
import type { RouteHistoryQuery } from "@valet/contracts";

import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import { createRouteHistoryQuery } from "./route-history-query";

@Injectable()
export class RouteHistoryService {
  private readonly query;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.query = createRouteHistoryQuery(pool);
  }

  execute(input: RouteHistoryQuery & {
    readonly authenticatedUserId: string;
    readonly trackingSessionId: string;
  }) {
    return this.query({
      authenticatedUserId: input.authenticatedUserId,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: input.limit,
      trackingSessionId: input.trackingSessionId,
    });
  }
}
