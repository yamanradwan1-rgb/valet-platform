import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import {
  dailyReportQuerySchema,
  dailyReportResponseSchema,
  monthlyReportQuerySchema,
  periodicReportResponseSchema,
  reportExportRequestSchema,
  weeklyReportQuerySchema,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { ApiTransportValidationError } from "../../common/http/api-errors";
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
import { generateReportExport } from "./report-export-service";
import {
  dailyAnalyticsReport,
  periodicAnalyticsReport,
} from "./report-read-service";
import {
  resolveDailyPeriod,
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
} from "./report-period";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T>(
  schema: {
    safeParse(
      value: unknown,
    ):
      | { readonly data: T; readonly success: true }
      | { readonly success: false };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new ApiTransportValidationError();
  return result.data;
}

function uuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

interface BinaryResponse extends HeaderResponse {
  status(code: number): { end(body: Buffer): void };
}

@Controller("v1/staff/dashboard/locations/:locationId/reports")
export class DashboardReportController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessionContexts: StaffSessionContextResolver,
  ) {}

  private async scope(
    request: ApiRequest,
    authorization: string | undefined,
    locationId: string,
  ) {
    const headers = request.rawHeaders;
    let count = 0;
    if (headers === undefined || headers.length % 2 !== 0) {
      throw new UnauthorizedException();
    }
    for (let index = 0; index < headers.length; index += 2) {
      if (headers[index]?.toLowerCase() === "authorization") count += 1;
    }
    if (count !== 1) throw new UnauthorizedException();
    const staffSessionContext =
      await this.sessionContexts.resolve(authorization);
    return {
      authenticatedUserId: staffSessionContext.userId,
      locationId: uuid(locationId),
      staffSessionContext,
    };
  }

  @Get("daily")
  daily(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("DASHBOARD_REPORT_DAILY", request, async () => {
      const scope = await this.scope(request, authorization, locationId);
      const parsed = parse(dailyReportQuerySchema, query);
      void resolveDailyPeriod(parsed.date);
      return dailyReportResponseSchema.parse(
        await dailyAnalyticsReport(this.pool, {
          authenticatedUserId: scope.authenticatedUserId,
          staffSessionContext: scope.staffSessionContext,
          date: parsed.date,
          locationId: scope.locationId,
        }),
      );
    });
  }

  @Get("weekly")
  weekly(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("DASHBOARD_REPORT_WEEKLY", request, async () => {
      const scope = await this.scope(request, authorization, locationId);
      const parsed = parse(weeklyReportQuerySchema, query);
      return periodicReportResponseSchema.parse(
        await periodicAnalyticsReport(this.pool, {
          authenticatedUserId: scope.authenticatedUserId,
          staffSessionContext: scope.staffSessionContext,
          kind: "WEEKLY",
          locationId: scope.locationId,
          period: resolveWeeklyPeriod(parsed.weekStart),
        }),
      );
    });
  }

  @Get("monthly")
  monthly(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run("DASHBOARD_REPORT_MONTHLY", request, async () => {
      const scope = await this.scope(request, authorization, locationId);
      const parsed = parse(monthlyReportQuerySchema, query);
      return periodicReportResponseSchema.parse(
        await periodicAnalyticsReport(this.pool, {
          authenticatedUserId: scope.authenticatedUserId,
          staffSessionContext: scope.staffSessionContext,
          kind: "MONTHLY",
          locationId: scope.locationId,
          period: resolveMonthlyPeriod(parsed.month),
        }),
      );
    });
  }

  @Post("exports")
  async exports(
    @Req() request: ApiRequest,
    @Res() response: BinaryResponse,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    await this.runner.run("DASHBOARD_REPORT_EXPORT", request, async () => {
      const scope = await this.scope(request, authorization, locationId);
      const parsed = parse(reportExportRequestSchema, body);
      const artifact = await generateReportExport(this.pool, {
        authenticatedUserId: scope.authenticatedUserId,
        staffSessionContext: scope.staffSessionContext,
        locationId: scope.locationId,
        request: parsed,
      });
      response.setHeader("Content-Type", artifact.contentType);
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${artifact.filename}"`,
      );
      setNoStoreResponseHeaders(response);
      response.status(200).end(Buffer.from(artifact.bytes));
    });
  }
}
