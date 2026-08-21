import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createStaffOperationalContextQuery } from "./staff-operational-context-query";

@Injectable()
export class StaffOperationalContextService {
  private readonly query;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.query = createStaffOperationalContextQuery(pool);
  }

  getOperationalContext(authenticatedUserId: string) {
    return this.query(authenticatedUserId);
  }
}
