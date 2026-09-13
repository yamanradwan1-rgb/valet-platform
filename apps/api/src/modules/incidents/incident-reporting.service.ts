import { Inject, Injectable } from "@nestjs/common";
import type {
  ReportIncidentRequest,
  ReportIncidentResponse,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createReportIncidentCommandExecutor } from "./incident-reporting-command";

@Injectable()
export class IncidentReportingService {
  private readonly executor;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.executor = createReportIncidentCommandExecutor(pool);
  }

  report(
    authenticatedUserId: string,
    sessionId: string,
    input: ReportIncidentRequest,
    recoveryProtocol = false,
  ): Promise<ReportIncidentResponse> {
    return this.executor({
      ...input,
      authenticatedUserId,
      recoveryProtocol,
      sessionId,
    });
  }
}
