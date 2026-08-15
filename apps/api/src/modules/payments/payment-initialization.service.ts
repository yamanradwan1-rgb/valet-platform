import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createInitializePaymentExecutor } from "./initialize-payment-command";

@Injectable()
export class PaymentInitializationService {
  private readonly initializePayment;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.initializePayment = createInitializePaymentExecutor(pool);
  }

  execute(input: Parameters<typeof this.initializePayment>[0]) {
    return this.initializePayment(input);
  }
}
