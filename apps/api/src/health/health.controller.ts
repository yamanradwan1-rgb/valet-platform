import {
  Controller,
  Get,
  Header,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";

import type { ApiRequest } from "../common/http/api-request";
import { HealthReadinessService } from "./health-readiness.service";

const healthSchema = {
  properties: { status: { type: "string" } },
  required: ["status"] as string[],
  type: "object",
} as const;

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly readiness: HealthReadinessService) {}

  @Get("live")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Dependency-independent process liveness" })
  @ApiOkResponse({ schema: healthSchema })
  live() {
    return { status: "ok" } as const;
  }

  @Get("ready")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Bounded serving readiness" })
  @ApiOkResponse({ schema: healthSchema })
  @ApiServiceUnavailableResponse({ schema: healthSchema })
  async ready(@Req() request?: ApiRequest) {
    if (!(await this.readiness.isReady(request))) {
      throw new ServiceUnavailableException({ status: "unavailable" });
    }
    return { status: "ok" } as const;
  }
}
