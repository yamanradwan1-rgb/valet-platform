import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  managementAlertInScopeCategorySchema,
  managementAlertPhaseOneCategorySchema,
  managementAlertPreviewResponseSchema,
  managementAlertSourceDetailResponseSchema,
  managementAlertUnifiedPreviewResponseSchema,
  managementAlertUnifiedSourceDetailResponseSchema,
  managementAlertSeenResponseSchema,
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
import { listUnifiedManagementAlertPreview } from "./management-alert-unified-preview-query";
import { readUnifiedManagementAlertDetail } from "./management-alert-unified-detail-query";
import { markManagementAlertOccurrenceSeen } from "./management-alert-seen/management-alert-seen-command";
import { DashboardOverviewError } from "./dashboard-overview-error";

/** Intentionally OFF until separate Owner rollout approval and release checks. */
export function managementAlertsPhaseOneEnabled(): boolean {
  return process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED === "enabled";
}

/** New-category rollout is an additional OFF-by-default gate, never permission. */
export function managementAlertsPhase23Enabled(): boolean {
  return (
    managementAlertsPhaseOneEnabled() &&
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED === "enabled"
  );
}
function requireSeenEpisodeId(body: unknown): string {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  const record = body as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.episodeId !== "string"
  ) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  return requireManagementUuid(record.episodeId);
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
        const source = {
          context,
          locationId: requireManagementUuid(locationId),
        };
        return managementAlertPreviewResponseSchema.parse(
          await listManagementAlertPreview(this.pool, source),
        );
      },
    );
  }

  /** Versioned response: old Phase-1 browser clients never receive a new DTO. */
  @Get("preview-unified")
  unifiedPreview(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "MANAGEMENT_ALERT_UNIFIED_PREVIEW",
      request,
      async () => {
        if (!managementAlertsPhase23Enabled()) {
          throw new DashboardOverviewError("AUTHORIZATION_DENIED");
        }
        requireSingleManagementAuthorization(request);
        const context = await this.sessions.resolve(authorization);
        return managementAlertUnifiedPreviewResponseSchema.parse(
          await listUnifiedManagementAlertPreview(this.pool, {
            context,
            locationId: requireManagementUuid(locationId),
          }),
        );
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

  /** Exact versioned source navigation, with current source authorization. */
  @Get("sources-unified/:category/:sourceId")
  unifiedSourceDetail(
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
      "MANAGEMENT_ALERT_UNIFIED_EXACT_SOURCE",
      request,
      async () => {
        if (!managementAlertsPhase23Enabled()) {
          throw new DashboardOverviewError("AUTHORIZATION_DENIED");
        }
        requireSingleManagementAuthorization(request);
        const parsed = managementAlertInScopeCategorySchema.safeParse(category);
        if (
          !parsed.success ||
          parsed.data === "ALT-17" ||
          typeof episodeId !== "string" ||
          !episodeId
        ) {
          throw new DashboardOverviewError("AUTHORIZATION_DENIED");
        }
        const context = await this.sessions.resolve(authorization);
        return managementAlertUnifiedSourceDetailResponseSchema.parse(
          await readUnifiedManagementAlertDetail(this.pool, {
            category: parsed.data,
            context,
            episodeId,
            locationId: requireManagementUuid(locationId),
            sourceId: requireManagementUuid(sourceId),
          }),
        );
      },
    );
  }

  /**
   * Mutation is only reachable with explicit per-item PUT while Phase23 is ON.
   * The command revalidates User, Staff session, Organization, Location, source,
   * MFA and immutable event in one transaction; neither GET nor bell open writes.
   */
  @Put("sources-unified/:category/:sourceId/seen")
  markSeen(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("category") category: string,
    @Param("sourceId") sourceId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "MANAGEMENT_ALERT_OCCURRENCE_SEEN",
      request,
      async () => {
        if (!managementAlertsPhase23Enabled()) {
          throw new DashboardOverviewError("AUTHORIZATION_DENIED");
        }
        requireSingleManagementAuthorization(request);
        const episodeId = requireSeenEpisodeId(body);
        const context = await this.sessions.resolve(authorization);
        return managementAlertSeenResponseSchema.parse(
          await markManagementAlertOccurrenceSeen(this.pool, {
            category,
            context,
            episodeId,
            locationId: requireManagementUuid(locationId),
            sourceId: requireManagementUuid(sourceId),
          }),
        );
      },
    );
  }
}
