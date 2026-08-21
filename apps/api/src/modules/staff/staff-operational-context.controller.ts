import {
  Controller,
  Get,
  Headers,
  Inject,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { staffOperationalContextResponseSchema } from "@valet/contracts";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { StaffOperationalContextService } from "./staff-operational-context.service";

@Controller("v1/staff")
export class StaffOperationalContextController {
  constructor(
    private readonly service: StaffOperationalContextService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private async userId(
    request: ApiRequest,
    authorization: string | undefined,
  ): Promise<string> {
    const rawHeaders = request.rawHeaders;
    let authorizationCount = 0;
    if (rawHeaders === undefined || rawHeaders.length % 2 !== 0) {
      throw new UnauthorizedException();
    }
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === "authorization") {
        authorizationCount += 1;
      }
    }
    if (authorizationCount !== 1) {
      throw new UnauthorizedException();
    }
    return (await this.principals.resolve(authorization)).userId;
  }

  @Get("operational-context")
  async getOperationalContext(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
  ) {
    return this.runner.run(
      "STAFF_OPERATIONAL_CONTEXT_READ",
      request,
      async () => {
        const authenticatedUserId = await this.userId(request, authorization);
        const result =
          await this.service.getOperationalContext(authenticatedUserId);
        return staffOperationalContextResponseSchema.parse(result);
      },
    );
  }
}
