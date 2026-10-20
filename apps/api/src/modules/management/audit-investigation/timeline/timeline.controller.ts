import {
  Controller,
  Get,
  Headers,
  Inject,
  Injectable,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  auditInvestigationDetailParamsSchema,
  auditInvestigationTimelineQuerySchema,
} from "@valet/contracts";

import type { PostgresPool } from "../../../../common/database/postgres";
import { inPostgresTransaction } from "../../../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../../../common/database/runtime-database.module";
import { ApiTransportValidationError } from "../../../../common/http/api-errors";
import { ApiOperationRunner } from "../../../../common/http/api-operation-runner";
import type { ApiRequest } from "../../../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContext,
  type StaffSessionContextResolver,
} from "../../../auth/staff-session-context";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "../../staff-management-http";
import {
  readAuthorizedAuditInvestigationEventDetail,
  readAuthorizedAuditInvestigationTimeline,
} from "./timeline-read-service";

@Injectable()
export class AuditInvestigationTimelineService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  timeline(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    sessionId: string,
    query: ReturnType<typeof auditInvestigationTimelineQuerySchema.parse>,
  ) {
    return inPostgresTransaction(this.pool, (tx) =>
      readAuthorizedAuditInvestigationTimeline(
        tx,
        context,
        organizationId,
        locationId,
        sessionId,
        query,
      ),
    );
  }

  detail(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    sessionId: string,
    source: ReturnType<
      typeof auditInvestigationDetailParamsSchema.parse
    >["source"],
    eventId: string,
  ) {
    return inPostgresTransaction(this.pool, (tx) =>
      readAuthorizedAuditInvestigationEventDetail(
        tx,
        context,
        organizationId,
        locationId,
        sessionId,
        source,
        eventId,
      ),
    );
  }
}

@Controller(
  "v1/staff/management/organizations/:organizationId/locations/:locationId/audit-investigations",
)
export class AuditInvestigationTimelineController {
  constructor(
    private readonly timelineService: AuditInvestigationTimelineService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("sessions/:sessionId/timeline")
  timeline(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Param("sessionId") sessionId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "AUDIT_INVESTIGATION_TIMELINE_READ",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        const parsed = auditInvestigationTimelineQuerySchema.safeParse(
          rawQuery ?? {},
        );
        if (!parsed.success) throw new ApiTransportValidationError();
        return this.timelineService.timeline(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(locationId),
          requireManagementUuid(sessionId),
          parsed.data,
        );
      },
    );
  }

  @Get("sessions/:sessionId/events/:source/:eventId")
  detail(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Param("locationId") locationId: string,
    @Param("sessionId") sessionId: string,
    @Param("source") source: string,
    @Param("eventId") eventId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "AUDIT_INVESTIGATION_DETAIL_READ",
      request,
      async () => {
        requireSingleManagementAuthorization(request);
        const parsed = auditInvestigationDetailParamsSchema.safeParse({
          sessionId,
          source,
          eventId,
        });
        if (!parsed.success) throw new ApiTransportValidationError();
        return this.timelineService.detail(
          await this.sessions.resolve(authorization),
          requireManagementUuid(organizationId),
          requireManagementUuid(locationId),
          parsed.data.sessionId,
          parsed.data.source,
          parsed.data.eventId,
        );
      },
    );
  }
}
