import { Inject, Injectable } from "@nestjs/common";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import { createTaskRouteRecordingsQuery } from "./task-route-recordings-query";

@Injectable()
export class TaskRouteRecordingsService {
  readonly execute: ReturnType<typeof createTaskRouteRecordingsQuery>;
  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.execute = createTaskRouteRecordingsQuery(pool);
  }
}
