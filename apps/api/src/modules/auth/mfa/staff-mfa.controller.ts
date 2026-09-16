import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  staffMfaEnrollmentBeginRequestSchema,
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmRequestSchema,
  staffMfaEnrollmentConfirmResponseSchema,
  staffMfaRecoveryCodesReissueRequestSchema,
  staffMfaRecoveryCodesReissueResponseSchema,
  staffMfaSelfRecoveryBeginRequestSchema,
  staffMfaSelfRecoveryBeginResponseSchema,
  staffMfaStateResponseSchema,
  staffMfaStepUpRequestSchema,
  staffMfaStepUpResponseSchema,
  type StaffMfaEnrollmentBeginRequest,
  type StaffMfaEnrollmentBeginResponse,
  type StaffMfaEnrollmentConfirmRequest,
  type StaffMfaEnrollmentConfirmResponse,
  type StaffMfaRecoveryCodesReissueRequest,
  type StaffMfaRecoveryCodesReissueResponse,
  type StaffMfaSelfRecoveryBeginRequest,
  type StaffMfaSelfRecoveryBeginResponse,
  type StaffMfaStateResponse,
  type StaffMfaStepUpRequest,
  type StaffMfaStepUpResponse,
} from "@valet/contracts";

import { ApiOperationRunner } from "../../../common/http/api-operation-runner";
import type { ApiRequest } from "../../../common/http/api-request";
import {
  type AuthResponse,
  parseAuthBody,
  requireAuthJson,
  requireEmptyAuthQuery,
  setPrivateAuthHeaders,
} from "../staff-auth.transport";
import { MfaEnrollmentService } from "./mfa-enrollment.service";
import { MfaRecoveryService } from "./mfa-recovery.service";
import { MfaStateService } from "./mfa-state.service";
import { MfaStepUpService } from "./mfa-step-up.service";

@Controller("v1/staff/auth/mfa")
export class StaffMfaController {
  constructor(
    private readonly enrollment: MfaEnrollmentService,
    private readonly recovery: MfaRecoveryService,
    private readonly stepUpService: MfaStepUpService,
    private readonly stateService: MfaStateService,
    private readonly runner: ApiOperationRunner,
  ) {}

  @Get("state")
  @HttpCode(HttpStatus.OK)
  async state(
    @Headers("authorization") authorization: string | undefined,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffMfaStateResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_MFA_STATE", request, async () => {
      requireEmptyAuthQuery(rawQuery);
      return staffMfaStateResponseSchema.parse(
        await this.stateService.state(authorization),
      );
    });
  }

  @Post("enrollment/begin")
  @HttpCode(HttpStatus.OK)
  async beginEnrollment(
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffMfaEnrollmentBeginResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_MFA_ENROLLMENT_BEGIN", request, async () => {
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      parseAuthBody<StaffMfaEnrollmentBeginRequest>(
        staffMfaEnrollmentBeginRequestSchema,
        rawBody === undefined ? {} : rawBody,
      );
      return staffMfaEnrollmentBeginResponseSchema.parse(
        await this.enrollment.begin(authorization),
      );
    });
  }

  @Post("enrollment/confirm")
  @HttpCode(HttpStatus.OK)
  async confirmEnrollment(
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffMfaEnrollmentConfirmResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_MFA_ENROLLMENT_CONFIRM", request, async () => {
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      const input = parseAuthBody<StaffMfaEnrollmentConfirmRequest>(
        staffMfaEnrollmentConfirmRequestSchema,
        rawBody,
      );
      return staffMfaEnrollmentConfirmResponseSchema.parse(
        await this.enrollment.confirm(authorization, input),
      );
    });
  }

  @Post("step-up")
  @HttpCode(HttpStatus.OK)
  async stepUp(
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffMfaStepUpResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_MFA_STEP_UP", request, async () => {
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      const input = parseAuthBody<StaffMfaStepUpRequest>(
        staffMfaStepUpRequestSchema,
        rawBody,
      );
      return staffMfaStepUpResponseSchema.parse(
        await this.stepUpService.stepUp(authorization, input.code),
      );
    });
  }

  @Post("recovery/begin")
  @HttpCode(HttpStatus.OK)
  async beginRecovery(
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffMfaSelfRecoveryBeginResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_MFA_SELF_RECOVERY_BEGIN", request, async () => {
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      const input = parseAuthBody<StaffMfaSelfRecoveryBeginRequest>(
        staffMfaSelfRecoveryBeginRequestSchema,
        rawBody,
      );
      return staffMfaSelfRecoveryBeginResponseSchema.parse(
        await this.recovery.beginSelfRecovery(authorization, input.recoveryCode),
      );
    });
  }

  @Post("recovery-codes/reissue")
  @HttpCode(HttpStatus.OK)
  async reissueRecoveryCodes(
    @Headers("authorization") authorization: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffMfaRecoveryCodesReissueResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run(
      "STAFF_AUTH_MFA_RECOVERY_CODES_REISSUE",
      request,
      async () => {
        requireAuthJson(contentType);
        requireEmptyAuthQuery(rawQuery);
        const input = parseAuthBody<StaffMfaRecoveryCodesReissueRequest>(
          staffMfaRecoveryCodesReissueRequestSchema,
          rawBody,
        );
        return staffMfaRecoveryCodesReissueResponseSchema.parse(
          await this.recovery.reissueRecoveryCodes(authorization, input.code),
        );
      },
    );
  }
}
