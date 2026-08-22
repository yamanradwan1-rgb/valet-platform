import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { locationSubscriptionResponseSchema } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import {
  RUNTIME_POSTGRES_POOL,
} from "../../common/database/runtime-database.module";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value: string): string {
  if (!uuidPattern.test(value)) throw new UnauthorizedException();
  return value;
}

@Controller("v1/staff/dashboard/locations/:locationId")
export class DashboardSubscriptionController {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  @Get("subscription")
  read(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationIdParam: string,
  ) {
    return this.runner.run("DASHBOARD_SUBSCRIPTION_READ", request, async () => {
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
      const locationId = uuid(locationIdParam);
      const { readLocationSubscription } = await import(
        "./subscription-read"
      );
      return locationSubscriptionResponseSchema.parse(
        await readLocationSubscription(this.pool, {
          authenticatedUserId,
          locationId,
        }),
      );
    });
  }
}
