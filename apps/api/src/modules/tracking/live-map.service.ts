import { Inject, Injectable } from "@nestjs/common";
import type { LiveOperationsMapQuery } from "@valet/contracts";

import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { createLiveMapQuery } from "./live-map-query";

@Injectable()
export class LiveMapService {
  private readonly query;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.query = createLiveMapQuery(pool);
  }

  execute(
    input: LiveOperationsMapQuery & {
      readonly authenticatedUserId: string;
      readonly locationId: string;
      readonly staffSessionContext?: StaffSessionContext;
    },
  ) {
    return this.query({
      authenticatedUserId: input.authenticatedUserId,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: input.limit,
      locationId: input.locationId,
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
    });
  }
}
