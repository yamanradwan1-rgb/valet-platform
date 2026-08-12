import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createStartParkingCommandExecutor } from "./start-parking-command";

@Injectable()
export class StartParkingService {
  private readonly startParking;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.startParking = createStartParkingCommandExecutor(pool);
  }

  execute(request: Parameters<typeof this.startParking>[0]) {
    return this.startParking(request);
  }
}
