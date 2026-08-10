import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
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
  guestAccessIssueRequestSchema,
  guestAccessIssueResponseSchema,
  guestAccessRevokeResponseSchema,
  guestSafeSessionResponseSchema,
  intakeRequestSchema,
  intakeResponseSchema,
  vehicleIdentityRequestSchema,
  vehicleIdentityResponseSchema,
  type CompleteCheckInRequest,
  type ConditionNoteRequest,
  type ConditionPhotoRequest,
  type GuestAccessIssueRequest,
  type IntakeRequest,
  type VehicleIdentityRequest,
} from "@valet/contracts";

import { GuestAccessError } from "../valet-sessions/guest-access-command";
import type { VehicleIdentityInput } from "../vehicles/vehicle-identity-command";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type CheckInApiRequest,
  type StaffPrincipalResolver,
} from "./check-in-api.boundaries";
import { CheckInTransportValidationError } from "./check-in-api.errors";
import { CheckInApiService } from "./check-in-api.service";
import { CheckInOperationRunner } from "./check-in-operation-runner";

interface ParseSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly data: T; readonly success: true } | { readonly success: false };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/;

function parse<T>(schema: ParseSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CheckInTransportValidationError();
  return parsed.data;
}

function parseAbsentOrEmptyBody(body: unknown): void {
  parse(emptyRequestSchema, body === undefined ? {} : body);
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw new CheckInTransportValidationError();
  return value;
}

function parseGuestBearer(value: string | undefined): string {
  const match = typeof value === "string" ? bearerPattern.exec(value) : null;
  if (match?.[1] === undefined) {
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
  return match[1];
}

function iso(value: Date): string {
  return value.toISOString();
}

@Controller("v1/staff/check-in")
export class StaffCheckInController {
  constructor(
    private readonly service: CheckInApiService,
    private readonly runner: CheckInOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  private async userId(authorization: string | undefined): Promise<string> {
    return (await this.principals.resolve(authorization)).userId;
  }

  @Post("intakes")
  async createIntake(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.runner.run("CHECK_IN_INTAKE", request, async () => {
      const principalUserId = await this.userId(authorization);
      const input = parse<IntakeRequest>(intakeRequestSchema, body);
      const result = await this.service.executeIntake({
        authenticatedUserId: principalUserId,
        ...(input.customer === undefined
          ? {}
          : {
              customer: {
                ...(input.customer.displayName === undefined
                  ? {}
                  : { displayName: input.customer.displayName }),
                phone: input.customer.phone,
              },
            }),
        intakeOperationId: input.intakeOperationId,
        targetLocationId: input.targetLocationId,
        vehicleIdentity: input.vehicleIdentity as VehicleIdentityInput,
      });
      const vehicleUpdatedAt = await this.service.loadVehicleUpdatedAt(result);
      return intakeResponseSchema.parse({
        createdAt: iso(result.createdAt),
        customerId: result.customerId,
        state: result.state,
        valetSessionId: result.valetSessionId,
        vehicleId: result.vehicleId,
        vehicleUpdatedAt: iso(vehicleUpdatedAt),
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
      const principalUserId = await this.userId(authorization);
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
      const principalUserId = await this.userId(authorization);
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
        const principalUserId = await this.userId(authorization);
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
      const principalUserId = await this.userId(authorization);
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
        const principalUserId = await this.userId(authorization);
        parseAbsentOrEmptyBody(body);
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
  @Post("sessions/:sessionId/guest-access/issue")
  async issueGuestAccess(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("CHECK_IN_GUEST_ACCESS_ISSUE", request, async () => {
      const principalUserId = await this.userId(authorization);
      const input = parse<GuestAccessIssueRequest>(
        guestAccessIssueRequestSchema,
        body,
      );
      const result = await this.service.executeGuestIssue({
        authenticatedUserId: principalUserId,
        ...(input.intent === "REISSUE_REVOKED"
          ? { expectedRevokedAt: new Date(input.expectedRevokedAt) }
          : {}),
        intent: input.intent,
        valetSessionId: parseUuid(sessionIdRaw),
      });
      return guestAccessIssueResponseSchema.parse({
        expiresAt: iso(result.expiresAt),
        issuedAt: iso(result.issuedAt),
        mutationKind: result.mutationKind,
        rawToken: result.rawToken,
        valetSessionId: result.valetSessionId,
      });
    });
  }

  @HttpCode(200)
  @Post("sessions/:sessionId/guest-access/revoke")
  async revokeGuestAccess(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionIdRaw: string,
    @Body() body: unknown,
  ) {
    return this.runner.run(
      "CHECK_IN_GUEST_ACCESS_REVOKE",
      request,
      async () => {
        const principalUserId = await this.userId(authorization);
        parseAbsentOrEmptyBody(body);
        const result = await this.service.executeGuestRevoke({
          authenticatedUserId: principalUserId,
          valetSessionId: parseUuid(sessionIdRaw),
        });
        return guestAccessRevokeResponseSchema.parse({
          revokedAt: iso(result.revokedAt),
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
      const principalUserId = await this.userId(authorization);
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

@Controller("v1/guest")
export class GuestCheckInController {
  constructor(
    private readonly service: CheckInApiService,
    private readonly runner: CheckInOperationRunner,
  ) {}

  @Get("session")
  async getSession(
    @Req() request: CheckInApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Query() query: unknown,
  ) {
    return this.runner.run("GUEST_SESSION_READ", request, async () => {
      parse(emptyRequestSchema, query ?? {});
      const result = await this.service.resolveGuest(
        parseGuestBearer(authorization),
      );
      return guestSafeSessionResponseSchema.parse(result);
    });
  }
}
