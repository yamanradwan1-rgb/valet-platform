import { Inject, Injectable } from "@nestjs/common";
import type {
  IncidentRecoveryResponse,
  ReserveIncidentRecoveryResponse,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createReserveIncidentRecoveryExecutor } from "./incident-recovery-intent-command";
import { createIncidentRecoveryQueryExecutor } from "./incident-recovery-query";
import { createRetireIncidentRecoveryExecutor } from "./incident-recovery-retirement-command";

@Injectable()
export class IncidentRecoveryService {
  private readonly reserveExecutor;
  private readonly queryExecutor;
  private readonly retireExecutor;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.reserveExecutor = createReserveIncidentRecoveryExecutor(pool);
    this.queryExecutor = createIncidentRecoveryQueryExecutor(pool);
    this.retireExecutor = createRetireIncidentRecoveryExecutor(pool);
  }

  reserve(
    authenticatedUserId: string,
    sessionId: string,
    incidentId: string,
  ): Promise<ReserveIncidentRecoveryResponse> {
    return this.reserveExecutor({ authenticatedUserId, incidentId, sessionId });
  }

  recover(
    authenticatedUserId: string,
    sessionId: string,
    incidentId: string,
  ): Promise<IncidentRecoveryResponse> {
    return this.queryExecutor({ authenticatedUserId, incidentId, sessionId });
  }

  retire(
    authenticatedUserId: string,
    sessionId: string,
    incidentId: string,
  ): Promise<IncidentRecoveryResponse> {
    return this.retireExecutor({ authenticatedUserId, incidentId, sessionId });
  }
}
