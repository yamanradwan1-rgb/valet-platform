import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  returningVehicleRecognitionRequestSchema,
  returningVehicleRecognitionResponseSchema,
  vehicleDetailsCorrectionRequestSchema,
  vehicleDetailsCorrectionResponseSchema,
  type ReturningVehicleRecognitionRequest,
  type VehicleDetailsCorrectionRequest,
} from "@valet/contracts";

import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import type { ConfirmedPlateIdentityInput } from "../vehicles/vehicle-identity-command";
import { CheckInApiService } from "./check-in-api.service";
import {
  checkInIso,
  parseCheckInBody,
  parseCheckInUuid,
  resolveCheckInUserId,
} from "./check-in-controller-support";
import {
  CheckInOperationRunner,
  type CheckInApiRequest,
} from "./check-in-operation-runner";

@Controller("v1/staff/check-in")
export class ReturningCheckInController {
  constructor(
    private readonly service: CheckInApiService,
    private readonly runner: CheckInOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  @Post("vehicle-recognition")
  async recognizeVehicle(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.runner.run(
      "CHECK_IN_VEHICLE_RECOGNITION",
      request,
      async () => {
        const userId = await resolveCheckInUserId(
          this.principals,
          request,
          authorization,
        );
        const input = parseCheckInBody<ReturningVehicleRecognitionRequest>(
          returningVehicleRecognitionRequestSchema,
          body,
        );
        const result = await this.service.recognizeReturningVehicle({
          authenticatedUserId: userId,
          targetLocationId: input.targetLocationId,
          vehicleIdentity: input.vehicleIdentity as ConfirmedPlateIdentityInput,
        });
        return returningVehicleRecognitionResponseSchema.parse({
          vehicle:
            result.vehicle === null
              ? null
              : {
                  ...result.vehicle,
                  vehicleUpdatedAt: checkInIso(result.vehicle.vehicleUpdatedAt),
                },
        });
      },
    );
  }

  @Put("sessions/:sessionId/vehicle-details")
  async correctVehicleDetails(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("CHECK_IN_VEHICLE_DETAILS", request, async () => {
      const userId = await resolveCheckInUserId(
        this.principals,
        request,
        authorization,
      );
      const input = parseCheckInBody<VehicleDetailsCorrectionRequest>(
        vehicleDetailsCorrectionRequestSchema,
        body,
      );
      const result = await this.service.correctVehicleDetails({
        authenticatedUserId: userId,
        color: input.color,
        expectedVehicleUpdatedAt: new Date(input.expectedVehicleUpdatedAt),
        make: input.make,
        model: input.model,
        valetSessionId: parseCheckInUuid(sessionIdRaw),
      });
      return vehicleDetailsCorrectionResponseSchema.parse({
        ...result,
        vehicleUpdatedAt: checkInIso(result.vehicleUpdatedAt),
      });
    });
  }
}
