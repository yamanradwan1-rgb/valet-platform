import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  staffLoginRequestSchema,
  staffNativeLogoutRequestSchema,
  staffNativeRefreshRequestSchema,
  type StaffLoginRequest,
  type StaffNativeAuthResponse,
  type StaffNativeLogoutRequest,
  type StaffNativeRefreshRequest,
} from "@valet/contracts";

import type { ApiRequest } from "../../common/http/api-request";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import { StaffLoginService } from "./staff-login.service";
import { StaffAuthService } from "./staff-auth.service";
import {
  type AuthResponse,
  nativeAccessResponse,
  parseAuthBody,
  requireAuthJson,
  requireEmptyAuthQuery,
  setPrivateAuthHeaders,
} from "./staff-auth.transport";

@Controller("v1/staff/auth/native")
export class NativeStaffAuthController {
  constructor(
    private readonly authService: StaffAuthService,
    private readonly loginService: StaffLoginService,
    private readonly runner: ApiOperationRunner,
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffNativeAuthResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_NATIVE_LOGIN", request, async () => {
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      const body = parseAuthBody<StaffLoginRequest>(
        staffLoginRequestSchema,
        rawBody,
      );
      return nativeAccessResponse(await this.loginService.login(body, request));
    });
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffNativeAuthResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_NATIVE_REFRESH", request, async () => {
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      const body = parseAuthBody<StaffNativeRefreshRequest>(
        staffNativeRefreshRequestSchema,
        rawBody,
      );
      return nativeAccessResponse(
        await this.authService.refresh(body.refreshToken),
      );
    });
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<void> {
    setPrivateAuthHeaders(response);
    await this.runner.run("STAFF_AUTH_NATIVE_LOGOUT", request, async () => {
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      const body = parseAuthBody<StaffNativeLogoutRequest>(
        staffNativeLogoutRequestSchema,
        rawBody,
      );
      await this.authService.logout(body.refreshToken);
    });
  }
}
