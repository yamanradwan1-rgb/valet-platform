import { Inject, Injectable } from "@nestjs/common";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createParkingSpotValidationQuery } from "./parking-spot-validation-query";

@Injectable()
export class ParkingSpotValidationService {
  private readonly validate;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.validate = createParkingSpotValidationQuery(pool);
  }

  execute(request: Parameters<typeof this.validate>[0]) {
    return this.validate(request);
  }
}
