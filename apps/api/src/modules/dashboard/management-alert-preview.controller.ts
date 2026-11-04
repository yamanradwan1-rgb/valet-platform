import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  managementAlertPhaseOneCategorySchema,
  managementAlertPreviewResponseSchema,
  managementAlertSourceDetailResponseSchema,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "../management/staff-management-http";
import { listManagementAlertPreview } from "./management-alert-preview-query";
import { readManagementAlertSourceDetail } from "./management-alert-source-detail-query";
import { DashboardOverviewError } from "./dashboard-overview-error";

/** Intentionally OFF until separate Owner rollout approval and release checks. */
export function managementAlertsPhaseOneEnabled(): boolean {
  return process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED === "enabled";
}

@Controller("v1/staff/dashboard/locations/:locationId/alerts")
export class ManagementAlertPreviewController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get("preview")
  preview(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "MANAGEMENT_ALERT_PHASE_ONE_PREVIEW",
      request,
      async () => {
        if (!managementAlertsPhaseOneEnabled()) {
          throw new DashboardOverviewError("AUTHORIZATION_DENIED");
        }
        requireSingleManagementAuthorization(request);
        const context = await this.sessions.resolve(authorization);
        const preview = await listManagementAlertPreview(this.pool, {
          context,
          locationId: requireManagementUuid(locationId),
        });
        return managementAlertPreviewResponseSchema.parse(preview);
      },
    );
  }

  @Get("sources/:category/:sourceId")
  sourceDetail(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("category") category: string,
    @Param("sourceId") sourceId: string,
    @Query("episodeId") episodeId: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "MANAGEMENT_ALERT_PHASE_ONE_EXACT_SOURCE",
      request,
      async () => {
        if (!managementAlertsPhaseOneEnabled()) {
          throw new DashboardOverviewError("AUTHORIZATION_DENIED");
        }
        requireSingleManagementAuthorization(request);
        const selectedCategory =
          managementAlertPhaseOneCategorySchema.safeParse(category);
        if (
          !selectedCategory.success ||
          typeof episodeId !== "string" ||
          !episodeId
        ) {
          throw new DashboardOverviewError("AUTHORIZATION_DENIED");
        }
        const context = await this.sessions.resolve(authorization);
        const result = await readManagementAlertSourceDetail(this.pool, {
          category: selectedCategory.data,
          context,
          episodeId,
          locationId: requireManagementUuid(locationId),
          sourceId: requireManagementUuid(sourceId),
        });
        return managementAlertSourceDetailResponseSchema.parse(result);
      },
    );
  }
}
