import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createDigitalCollectionExecutor } from "./digital-collection-command";
import type {
  DigitalCollectionOperation,
  InitiateDigitalCollectionRequest,
} from "./digital-collection-types";
import { DigitalPaymentProviderRegistry } from "./digital-payment-provider";

@Injectable()
export class DigitalCollectionService {
  private readonly execute: ReturnType<typeof createDigitalCollectionExecutor>;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool,
    registry: DigitalPaymentProviderRegistry,
  ) {
    this.execute = createDigitalCollectionExecutor(pool, registry);
  }

  initiate(
    request: InitiateDigitalCollectionRequest,
  ): Promise<DigitalCollectionOperation> {
    return this.execute(request);
  }
}
