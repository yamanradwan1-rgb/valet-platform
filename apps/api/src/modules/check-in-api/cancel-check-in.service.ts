import { Inject, Injectable } from "@nestjs/common";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createCancelCheckInCommandExecutor } from "../valet-sessions/cancel-check-in-command";
import { createCancelCheckInStatusQuery } from "../valet-sessions/cancel-check-in-status-query";

@Injectable()
export class CancelCheckInService {
  readonly cancel;
  readonly status;
  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.cancel = createCancelCheckInCommandExecutor(pool);
    this.status = createCancelCheckInStatusQuery(pool);
  }
}
