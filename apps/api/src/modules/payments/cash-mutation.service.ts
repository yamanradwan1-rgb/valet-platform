import { Inject, Injectable } from "@nestjs/common";
import type {
  CashAdjustmentRequest,
  CashReceiptRequest,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  createCashAdjustmentExecutor,
  createCashReceiptExecutor,
} from "./cash-command";

interface StaffCashScope {
  readonly authenticatedUserId: string;
  readonly valetSessionId: string;
}

@Injectable()
export class CashMutationService {
  private readonly adjustCash;
  private readonly receiveCash;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.adjustCash = createCashAdjustmentExecutor(pool);
    this.receiveCash = createCashReceiptExecutor(pool);
  }

  receipt(input: StaffCashScope & CashReceiptRequest) {
    return this.receiveCash(input);
  }

  adjustment(input: StaffCashScope & CashAdjustmentRequest) {
    return this.adjustCash(input);
  }
}
