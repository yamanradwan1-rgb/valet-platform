import { Inject, Injectable } from "@nestjs/common";
import type { RefundRequest } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createRefundExecutor } from "./refund-command";

interface StaffRefundScope {
  readonly authenticatedUserId: string;
  readonly valetSessionId: string;
}

@Injectable()
export class RefundService {
  private readonly createRefund;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.createRefund = createRefundExecutor(pool);
  }

  create(input: StaffRefundScope & RefundRequest) {
    return this.createRefund(input);
  }
}
