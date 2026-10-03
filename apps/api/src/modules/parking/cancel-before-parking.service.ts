import { Inject, Injectable } from "@nestjs/common";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createCancelBeforeParkingCommandExecutor } from "./cancel-before-parking-command";
import { createParkingCancellationStatusQuery } from "./cancel-before-parking-status-query";

@Injectable()
export class CancelBeforeParkingService {
  private readonly cancel;
  private readonly status;
  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.cancel = createCancelBeforeParkingCommandExecutor(pool);
    this.status = createParkingCancellationStatusQuery(pool);
  }
  execute(input: Parameters<typeof this.cancel>[0]) {
    return this.cancel(input);
  }
  read(input: Parameters<typeof this.status>[0]) {
    return this.status(input);
  }
}
