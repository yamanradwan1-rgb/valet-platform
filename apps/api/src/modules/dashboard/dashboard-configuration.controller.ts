import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  clearConfigurationOverrideRequestSchema,
  configurationMutationResponseSchema,
  locationConfigurationResponseSchema,
  setConfigurationOverrideRequestSchema,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { DashboardConfigurationService } from "./dashboard-configuration-command";

interface Schema<T> {
  safeParse(value: unknown):
    | { readonly data: T; readonly success: true }
    | { readonly success: false };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T>(schema: Schema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiTransportValidationError();
  return result.data;
}

function uuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/dashboard/locations/:locationId/configuration")
export class DashboardConfigurationController {
  constructor(
    private readonly service: DashboardConfigurationService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
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
    const authenticatedUserId = (
      await this.principals.resolve(authorization)
    ).userId;
    return { authenticatedUserId, locationId: uuid(locationId) };
  }

  @Get()
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
  ) {
    return this.runner.run(
      "DASHBOARD_CONFIGURATION_READ",
      request,
      async () =>
        locationConfigurationResponseSchema.parse(
          await this.service.read(
            await this.scope(request, authorization, locationId),
          ),
        ),
    );
  }

  @Put("override")
  setOverride(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run(
      "DASHBOARD_CONFIGURATION_OVERRIDE_SET",
      request,
      async () => {
        const parsed = parse(setConfigurationOverrideRequestSchema, body);
        const result = await this.service.setOverride({
          ...parsed,
          ...(await this.scope(request, authorization, locationId)),
        });
        return configurationMutationResponseSchema.parse({
          locationId: uuid(locationId),
          result: result.result,
          updatedAt: result.updatedAt,
        });
      },
    );
  }

  @Post("override/clear")
  clearOverride(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run(
      "DASHBOARD_CONFIGURATION_OVERRIDE_CLEAR",
      request,
      async () => {
        const parsed = parse(clearConfigurationOverrideRequestSchema, body);
        const result = await this.service.clearOverride({
          ...parsed,
          ...(await this.scope(request, authorization, locationId)),
        });
        return configurationMutationResponseSchema.parse({
          locationId: uuid(locationId),
          result: result.result,
          updatedAt: result.updatedAt,
        });
      },
    );
  }
}
