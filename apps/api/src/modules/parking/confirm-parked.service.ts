import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createConfirmParkedCommandExecutor } from "./confirm-parked-command";

@Injectable()
export class ConfirmParkedService {
  private readonly confirmParked;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.confirmParked = createConfirmParkedCommandExecutor(pool);
  }

  execute(request: Parameters<typeof this.confirmParked>[0]) {
    return this.confirmParked(request);
  }
}
