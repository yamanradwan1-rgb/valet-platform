import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { incidentRecoveryCapability } from "@valet/contracts";

@ApiTags("bootstrap")
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: "Confirm that the API scaffold is running" })
  @ApiOkResponse({
    schema: {
      example: { name: "valet-api", status: "ok" },
      properties: {
        name: { type: "string" },
        status: { type: "string" },
      },
    },
  })
  getStatus() {
    return { name: "valet-api", status: "ok" } as const;
  }

  @Get("capabilities/incident-recovery")
  incidentRecoveryCapability() {
    return { capability: incidentRecoveryCapability } as const;
  }
}
