import { Inject, Injectable } from "@nestjs/common";
import type { ShiftPresenceEvidence } from "@valet/contracts";
import type { StaffSessionContext } from "../auth/staff-session-context";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createActiveShiftQuery } from "./active-shift-query";
import { createEndShiftCommandExecutor } from "./end-shift-command";
import { createStartShiftCommandExecutor } from "./start-shift-command";

@Injectable()
export class ShiftService {
  private readonly endShift;
  private readonly findActiveShift;
  private readonly startShift;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.endShift = createEndShiftCommandExecutor(pool);
    this.findActiveShift = createActiveShiftQuery(pool);
    this.startShift = createStartShiftCommandExecutor(pool);
  }

  executeStart(request: {
    readonly authenticatedUserId: string;
    readonly targetLocationId: string;
    readonly operationId?: string;
    readonly presence?: ShiftPresenceEvidence;
    readonly sessionContext?: StaffSessionContext;
  }) {
    return this.startShift(request);
  }

  executeEnd(request: {
    readonly authenticatedUserId: string;
    readonly cashReported: string;
    readonly shiftId: string;
    readonly operationId?: string;
    readonly presence?: ShiftPresenceEvidence;
    readonly sessionContext?: StaffSessionContext;
  }) {
    return this.endShift(request);
  }

  loadActive(request: {
    readonly authenticatedUserId: string;
    readonly locationId: string;
  }) {
    return this.findActiveShift(request);
  }
}
