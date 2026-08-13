import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createCompleteHandoffExecutor } from "./complete-handoff-command";

@Injectable()
export class CompleteHandoffService {
  private readonly completeHandoff;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.completeHandoff = createCompleteHandoffExecutor(pool);
  }

  execute(input: Parameters<typeof this.completeHandoff>[0]) {
    return this.completeHandoff(input);
  }
}
