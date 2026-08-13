import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createStartRetrievalCommandExecutor } from "./start-retrieval-command";

@Injectable()
export class StartRetrievalService {
  private readonly startRetrieval;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.startRetrieval = createStartRetrievalCommandExecutor(pool);
  }

  execute(request: Parameters<typeof this.startRetrieval>[0]) {
    return this.startRetrieval(request);
  }
}
