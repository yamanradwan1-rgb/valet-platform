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
} from "@nestjs/common";
import {
  companyDailyReportQuerySchema,
  companyDailyReportResponseSchema,
  companyMonthlyReportQuerySchema,
  companyPeriodicReportResponseSchema,
  companyReportExportRequestSchema,
  companyWeeklyReportQuerySchema,
} from "@valet/contracts";

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
import {
  resolveDailyPeriod,
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
} from "../dashboard/report-period";
import { ManagementCompanyReportExportService } from "./company-report-export-service";
import { ManagementCompanyReportService } from "./company-report-read-service";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
  type StaffManagementCommandSchema,
} from "./staff-management-http";

interface BinaryResponse extends HeaderResponse {
  status(code: number): { end(body: Buffer): void };
}

function parse<T>(schema: StaffManagementCommandSchema<T>, value: unknown): T {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new ApiTransportValidationError();
  return result.data;
}

@Controller("v1/staff/management/organizations")
export class ManagementCompanyReportController {
  constructor(
    private readonly reports: ManagementCompanyReportService,
    private readonly exports: ManagementCompanyReportExportService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  private async context(request: ApiRequest, authorization: string | undefined) {
    requireSingleManagementAuthorization(request);
    return this.sessions.resolve(authorization);
  }

  @Get(":organizationId/reports/daily")
  daily(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_COMPANY_REPORT_DAILY", request, async () => {
      const query = parse(companyDailyReportQuerySchema, rawQuery);
      const context = await this.context(request, authorization);
      return companyDailyReportResponseSchema.parse(
        await this.reports.read(
          context,
          requireManagementUuid(organizationId),
          "DAILY",
          resolveDailyPeriod(query.date),
        ),
      );
    });
  }

  @Get(":organizationId/reports/weekly")
  weekly(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_COMPANY_REPORT_WEEKLY", request, async () => {
      const query = parse(companyWeeklyReportQuerySchema, rawQuery);
      const context = await this.context(request, authorization);
      return companyPeriodicReportResponseSchema.parse(
        await this.reports.read(
          context,
          requireManagementUuid(organizationId),
          "WEEKLY",
          resolveWeeklyPeriod(query.weekStart),
        ),
      );
    });
  }

  @Get(":organizationId/reports/monthly")
  monthly(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("MANAGEMENT_COMPANY_REPORT_MONTHLY", request, async () => {
      const query = parse(companyMonthlyReportQuerySchema, rawQuery);
      const context = await this.context(request, authorization);
      return companyPeriodicReportResponseSchema.parse(
        await this.reports.read(
          context,
          requireManagementUuid(organizationId),
          "MONTHLY",
          resolveMonthlyPeriod(query.month),
        ),
      );
    });
  }

  @Post(":organizationId/reports/exports")
  async export(
    @Req() request: ApiRequest,
    @Res() response: BinaryResponse,
    @Headers("authorization") authorization: string | undefined,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
  ) {
    setNoStoreResponseHeaders(response);
    await this.runner.run("MANAGEMENT_COMPANY_REPORT_EXPORT", request, async () => {
      const command = parse(companyReportExportRequestSchema, body);
      const context = await this.context(request, authorization);
      const artifact = await this.exports.generate(
        context,
        requireManagementUuid(organizationId),
        command,
      );
      response.setHeader("Content-Type", artifact.contentType);
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${artifact.filename}"`,
      );
      response.status(200).end(Buffer.from(artifact.bytes));
    });
  }
}
