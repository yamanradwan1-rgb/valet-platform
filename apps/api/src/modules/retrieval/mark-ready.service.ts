import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createMarkReadyCommandExecutor } from "./mark-ready-command";

@Injectable()
export class MarkReadyService {
  private readonly markReady;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.markReady = createMarkReadyCommandExecutor(pool);
  }

  execute(request: Parameters<typeof this.markReady>[0]) {
    return this.markReady(request);
  }
}
