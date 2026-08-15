import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createGpsIngestionCommandExecutor } from "./gps-ingestion-command";

@Injectable()
export class GpsIngestionService {
  private readonly ingest;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.ingest = createGpsIngestionCommandExecutor(pool);
  }

  execute(request: Parameters<typeof this.ingest>[0]) {
    return this.ingest(request);
  }
}
