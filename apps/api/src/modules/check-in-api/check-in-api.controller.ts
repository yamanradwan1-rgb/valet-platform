import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  completeCheckInRequestSchema,
  completeCheckInResponseSchema,
  conditionCompletionResponseSchema,
  conditionNoteRequestSchema,
  conditionNoteResponseSchema,
  conditionPhotoRequestSchema,
  conditionPhotoResponseSchema,
  emptyRequestSchema,
  intakeRequestSchema,
  intakeResponseSchema,
  vehicleIdentityRequestSchema,
  vehicleIdentityResponseSchema,
  type CompleteCheckInRequest,
  type ConditionNoteRequest,
  type ConditionPhotoRequest,
  type IntakeRequest,
  type VehicleIdentityRequest,
} from "@valet/contracts";

import type { VehicleIdentityInput } from "../vehicles/vehicle-identity-command";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { CheckInApiService } from "./check-in-api.service";
import {
  checkInIso as iso,
  parseCheckInBody as parse,
  parseCheckInEmptyBody as parseAbsentOrEmptyBody,
  parseCheckInUuid as parseUuid,
  resolveCheckInUserId,
} from "./check-in-controller-support";
import {
  CheckInOperationRunner,
  type CheckInApiRequest,
} from "./check-in-operation-runner";

@Controller("v1/staff/check-in")
export class StaffCheckInController {
  constructor(
    private readonly service: CheckInApiService,
    private readonly runner: CheckInOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private userId(
    request: CheckInApiRequest,
    authorization: string | undefined,
  ): Promise<string> {
    return resolveCheckInUserId(this.principals, request, authorization);
  }

  @Post("intakes")
  async createIntake(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.runner.run("CHECK_IN_INTAKE", request, async () => {
      const principalUserId = await this.userId(request, authorization);
      const input = parse<IntakeRequest>(intakeRequestSchema, body);
      const result = await this.service.executeIntake({
        authenticatedUserId: principalUserId,
        ...(input.customer === undefined
          ? {}
          : {
              customer:
                input.customer.intent === "USE_SAVED_CUSTOMER"
                  ? input.customer
                  : {
                      ...(input.customer.displayName === undefined
                        ? {}
                        : { displayName: input.customer.displayName }),
                      intent: input.customer.intent,
                      phone: input.customer.phone,
                    },
            }),
        intakeOperationId: input.intakeOperationId,
        targetLocationId: input.targetLocationId,
        ...(input.vehicleDetails === undefined
          ? {}
          : {
              vehicleDetails: {
                ...(input.vehicleDetails.color === undefined
                  ? {}
                  : { color: input.vehicleDetails.color }),
                ...(input.vehicleDetails.make === undefined
                  ? {}
                  : { make: input.vehicleDetails.make }),
                ...(input.vehicleDetails.model === undefined
                  ? {}
                  : { model: input.vehicleDetails.model }),
              },
            }),
        vehicleIdentity: input.vehicleIdentity as VehicleIdentityInput,
      });
      return intakeResponseSchema.parse({
        color: result.color,
        createdAt: iso(result.createdAt),
        customerId: result.customerId,
        make: result.make,
        model: result.model,
        state: result.state,
        valetSessionId: result.valetSessionId,
        vehicleId: result.vehicleId,
        vehicleUpdatedAt: iso(result.vehicleUpdatedAt),
        version: result.version,
      });
    });
  }

  @Put("sessions/:sessionId/vehicle-identity")
  async updateVehicleIdentity(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("CHECK_IN_VEHICLE_IDENTITY", request, async () => {
      const principalUserId = await this.userId(request, authorization);
      const sessionId = parseUuid(sessionIdRaw);
      const input = parse<VehicleIdentityRequest>(
        vehicleIdentityRequestSchema,
        body,
      );
      const result = await this.service.executeVehicleIdentity({
        authenticatedUserId: principalUserId,
        expectedVehicleUpdatedAt: new Date(input.expectedVehicleUpdatedAt),
        identity: input.identity as VehicleIdentityInput,
        valetSessionId: sessionId,
      });
      return vehicleIdentityResponseSchema.parse({
        identityMode: result.identityMode,
        plateCountry: result.plateCountry,
        plateNumberNormalized: result.plateNumberNormalized,
        plateNumberRaw: result.plateNumberRaw,
        temporaryDescriptor: result.temporaryDescriptor,
        valetSessionId: result.valetSessionId,
        vehicleId: result.vehicleId,
        vehicleUpdatedAt: iso(result.vehicleUpdatedAt),
      });
    });
  }

  @Post("sessions/:sessionId/condition-notes")
  async recordConditionNote(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("CHECK_IN_CONDITION_NOTE", request, async () => {
      const principalUserId = await this.userId(request, authorization);
      const input = parse<ConditionNoteRequest>(
        conditionNoteRequestSchema,
        body,
      );
      const result = await this.service.executeConditionNote({
        authenticatedUserId: principalUserId,
        content: input.content,
        valetSessionId: parseUuid(sessionIdRaw),
      });
      return conditionNoteResponseSchema.parse({
        conditionNoteId: result.conditionNoteId,
        content: result.content,
        createdAt: iso(result.createdAt),
        supersedesConditionNoteId: result.supersedesConditionNoteId,
        valetSessionId: result.valetSessionId,
      });
    });
  }

  @Post("sessions/:sessionId/condition-notes/:noteId/corrections")
  async correctConditionNote(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Param("noteId") noteIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run(
      "CHECK_IN_CONDITION_NOTE_CORRECTION",
      request,
      async () => {
        const principalUserId = await this.userId(request, authorization);
        const input = parse<ConditionNoteRequest>(
          conditionNoteRequestSchema,
          body,
        );
        const result = await this.service.executeConditionCorrection({
          authenticatedUserId: principalUserId,
          content: input.content,
          supersedesConditionNoteId: parseUuid(noteIdRaw),
          valetSessionId: parseUuid(sessionIdRaw),
        });
        return conditionNoteResponseSchema.parse({
          conditionNoteId: result.conditionNoteId,
          content: result.content,
          createdAt: iso(result.createdAt),
          supersedesConditionNoteId: result.supersedesConditionNoteId,
          valetSessionId: result.valetSessionId,
        });
      },
    );
  }

  @Post("sessions/:sessionId/condition-photos")
  async registerConditionPhoto(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("CHECK_IN_CONDITION_PHOTO", request, async () => {
      const principalUserId = await this.userId(request, authorization);
      const input = parse<ConditionPhotoRequest>(
        conditionPhotoRequestSchema,
        body,
      );
      const result = await this.service.executeConditionPhoto({
        authenticatedUserId: principalUserId,
        contentType: input.contentType,
        storageObjectKey: input.storageObjectKey,
        valetSessionId: parseUuid(sessionIdRaw),
      });
      return conditionPhotoResponseSchema.parse({
        contentType: result.contentType,
        createdAt: iso(result.createdAt),
        valetSessionId: result.valetSessionId,
        vehiclePhotoId: result.vehiclePhotoId,
      });
    });
  }

  @HttpCode(200)
  @Post("sessions/:sessionId/condition-completion")
  async completeCondition(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run(
      "CHECK_IN_CONDITION_COMPLETION",
      request,
      async () => {
        const principalUserId = await this.userId(request, authorization);
        parseAbsentOrEmptyBody(emptyRequestSchema, body);
        const result = await this.service.executeConditionCompletion({
          authenticatedUserId: principalUserId,
          valetSessionId: parseUuid(sessionIdRaw),
        });
        return conditionCompletionResponseSchema.parse({
          completedAt: iso(result.completedAt),
          valetSessionId: result.valetSessionId,
        });
      },
    );
  }

  @HttpCode(200)
  @Post("sessions/:sessionId/complete")
  async completeCheckIn(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("COMPLETE_CHECK_IN", request, async () => {
      const principalUserId = await this.userId(request, authorization);
      const input = parse<CompleteCheckInRequest>(
        completeCheckInRequestSchema,
        body,
      );
      const completed = await this.service.executeCompleteCheckIn({
        authenticatedUserId: principalUserId,
        expectedVersion: input.expectedVersion,
        valetSessionId: parseUuid(sessionIdRaw),
      });
      if (completed.checkInElapsedMs !== undefined) {
        request.checkInElapsedMs = completed.checkInElapsedMs;
      }
      return completeCheckInResponseSchema.parse({
        checkingInCompletedAt: iso(completed.result.checkingInCompletedAt),
        state: completed.result.state,
        valetSessionId: completed.result.valetSessionId,
        version: completed.result.version,
      });
    });
  }
}
