import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createAssignKeySlotCommandExecutor } from "./assign-key-slot-command";
import { createClearKeySlotCommandExecutor } from "./clear-key-slot-command";

@Injectable()
export class KeyCustodyService {
  private readonly assignKeySlot;
  private readonly clearKeySlot;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.assignKeySlot = createAssignKeySlotCommandExecutor(pool);
    this.clearKeySlot = createClearKeySlotCommandExecutor(pool);
  }

  executeAssign(request: {
    readonly authenticatedUserId: string;
    readonly expectedVersion: number;
    readonly keySlotCode: string;
    readonly sessionId: string;
  }) {
    return this.assignKeySlot(request);
  }

  executeClear(request: {
    readonly authenticatedUserId: string;
    readonly expectedVersion: number;
    readonly sessionId: string;
  }) {
    return this.clearKeySlot(request);
  }
}
