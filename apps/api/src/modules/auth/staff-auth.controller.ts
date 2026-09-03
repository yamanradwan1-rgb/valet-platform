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
  emptyRequestSchema,
  staffLoginRequestSchema,
  type StaffAuthAccessResponse,
  type StaffLoginRequest,
} from "@valet/contracts";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";

import type { ApiRequest } from "../../common/http/api-request";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import { StaffAuthOriginPolicy } from "./staff-auth.origin";
import { StaffLoginService } from "./staff-login.service";
import {
  StaffAuthenticationError,
  StaffAuthService,
} from "./staff-auth.service";
import {
  type AuthResponse,
  parseAuthBody,
  requireAuthJson,
  requireEmptyAuthQuery,
  setPrivateAuthHeaders,
  webAccessResponse,
} from "./staff-auth.transport";

const refreshCookieName = "__Secure-vaylet_staff_refresh";
const initialSessionMaxAgeSeconds = 2_592_000;

export class StaffAuthOriginError extends Error {
  readonly code = "STAFF_AUTH_ORIGIN_NOT_ALLOWED";

  constructor() {
    super("The request origin is not allowed.");
    this.name = "StaffAuthOriginError";
  }
}

function requireEmptyBody(body: unknown): void {
  parseAuthBody(emptyRequestSchema, body === undefined ? {} : body);
}

function refreshCookie(value: string, maxAge: number): string {
  return serializeCookie(refreshCookieName, value, {
    httpOnly: true,
    maxAge,
    path: "/v1/staff/auth",
    sameSite: "strict",
    secure: true,
  });
}

function clearRefreshCookie(): string {
  return refreshCookie("", 0);
}

function readRefreshCookie(
  cookieHeader: string | undefined,
): string | undefined {
  if (cookieHeader === undefined) return undefined;
  const matchingNames = cookieHeader
    .split(";")
    .map((part) => part.split("=", 1)[0]?.trim())
    .filter((name) => name === refreshCookieName);
  if (matchingNames.length !== 1) return undefined;
  try {
    return parseCookie(cookieHeader)[refreshCookieName];
  } catch {
    return undefined;
  }
}

@Controller("v1/staff/auth")
export class StaffAuthController {
  constructor(
    private readonly authService: StaffAuthService,
    private readonly loginService: StaffLoginService,
    private readonly originPolicy: StaffAuthOriginPolicy,
    private readonly runner: ApiOperationRunner,
  ) {}

  private requireOrigin(origin: string | undefined): void {
    if (!this.originPolicy.allows(origin)) throw new StaffAuthOriginError();
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Headers("origin") origin: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffAuthAccessResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_LOGIN", request, async () => {
      this.requireOrigin(origin);
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      const body = parseAuthBody<StaffLoginRequest>(
        staffLoginRequestSchema,
        rawBody,
      );
      const tokens = await this.loginService.login(body, request);
      const result = webAccessResponse(tokens);
      response.setHeader(
        "Set-Cookie",
        refreshCookie(tokens.refreshToken, initialSessionMaxAgeSeconds),
      );
      return result;
    });
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Headers("origin") origin: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffAuthAccessResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_REFRESH", request, async () => {
      this.requireOrigin(origin);
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      requireEmptyBody(rawBody);
      try {
        const refreshToken = readRefreshCookie(cookieHeader);
        if (refreshToken === undefined) {
          throw new StaffAuthenticationError();
        }
        const tokens = await this.authService.refresh(refreshToken);
        const result = webAccessResponse(tokens);
        response.setHeader(
          "Set-Cookie",
          refreshCookie(tokens.refreshToken, tokens.refreshCookieMaxAgeSeconds),
        );
        return result;
      } catch (error) {
        if (error instanceof StaffAuthenticationError) {
          response.setHeader("Set-Cookie", clearRefreshCookie());
        }
        throw error;
      }
    });
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Headers("origin") origin: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() rawBody: unknown,
    @Query() rawQuery: unknown,
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<void> {
    setPrivateAuthHeaders(response);
    await this.runner.run("STAFF_AUTH_LOGOUT", request, async () => {
      this.requireOrigin(origin);
      requireAuthJson(contentType);
      requireEmptyAuthQuery(rawQuery);
      requireEmptyBody(rawBody);
      await this.authService.logout(readRefreshCookie(cookieHeader));
      response.setHeader("Set-Cookie", clearRefreshCookie());
    });
  }
}
