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
  brandingClearRequestSchema,
  brandingReadResponseSchema,
  brandingSetRequestSchema,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import {
  RUNTIME_POSTGRES_POOL,
} from "../../common/database/runtime-database.module";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T>(schema: {
  safeParse(value: unknown):
    | { readonly data: T; readonly success: true }
    | { readonly success: false };
}, value: unknown): T {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new ApiTransportValidationError();
  return result.data;
}

function uuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

@Controller("v1/staff/dashboard/locations/:locationId")
export class DashboardBrandingSubscriptionController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
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
    return {
      authenticatedUserId: (await this.principals.resolve(authorization)).userId,
      locationId: uuid(locationId),
    };
  }

  @Get("branding")
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
  ) {
    return this.runner.run("DASHBOARD_BRANDING_READ", request, async () => {
      const scope = await this.scope(request, authorization, locationId);
      const { readLocationBranding } = await import("./branding-command");
      return brandingReadResponseSchema.parse(
        await readLocationBranding(this.pool, scope),
      );
    });
  }

  @Put("branding/override")
  setOverride(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("DASHBOARD_BRANDING_OVERRIDE_SET", request, async () => {
      const scope = await this.scope(request, authorization, locationId);
      const parsed = parse(brandingSetRequestSchema, body);
      const { setBrandingOverride } = await import("./branding-command");
      return brandingReadResponseSchema.parse(
        await setBrandingOverride(this.pool, {
          ...parsed,
          ...scope,
        }),
      );
    });
  }

  @Post("branding/override/clear")
  clearOverride(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run(
      "DASHBOARD_BRANDING_OVERRIDE_CLEAR",
      request,
      async () => {
        const scope = await this.scope(request, authorization, locationId);
        const parsed = parse(brandingClearRequestSchema, body);
        const { clearBrandingOverride } = await import("./branding-command");
        return brandingReadResponseSchema.parse(
          await clearBrandingOverride(this.pool, {
            ...parsed,
            ...scope,
          }),
        );
      },
    );
  }
}
