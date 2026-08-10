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
  staffAuthAccessResponseSchema,
  staffLoginRequestSchema,
  type StaffAuthAccessResponse,
  type StaffLoginRequest,
} from "@valet/contracts";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";

import type { CheckInApiRequest } from "../check-in-api/check-in-api.boundaries";
import { CheckInTransportValidationError } from "../check-in-api/check-in-api.errors";
import { CheckInOperationRunner } from "../check-in-api/check-in-operation-runner";
import { StaffAuthOriginPolicy } from "./staff-auth.origin";
import {
  StaffAuthenticationError,
  StaffAuthService,
  type StaffAuthTokens,
} from "./staff-auth.service";

const refreshCookieName = "__Secure-vaylet_staff_refresh";
const initialSessionMaxAgeSeconds = 2_592_000;

interface AuthResponse {
  setHeader(name: string, value: string): void;
}

interface ParseSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly data: T; readonly success: true } | { readonly success: false };
}

export class StaffAuthOriginError extends Error {
  readonly code = "STAFF_AUTH_ORIGIN_NOT_ALLOWED";

  constructor() {
    super("The request origin is not allowed.");
    this.name = "StaffAuthOriginError";
  }
}

function parse<T>(schema: ParseSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CheckInTransportValidationError();
  return parsed.data;
}

function requireEmptyBody(body: unknown): void {
  parse(emptyRequestSchema, body === undefined ? {} : body);
}

function requireJson(contentType: string | undefined): void {
  if (
    contentType === undefined ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
  ) {
    throw new CheckInTransportValidationError();
  }
}

function requireEmptyQuery(query: unknown): void {
  parse(emptyRequestSchema, query === undefined ? {} : query);
}

function setPrivateAuthHeaders(response: AuthResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
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

function readRefreshCookie(cookieHeader: string | undefined): string | undefined {
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

function accessResponse(tokens: StaffAuthTokens): StaffAuthAccessResponse {
  return staffAuthAccessResponseSchema.parse({
    accessExpiresAt: tokens.accessExpiresAt.toISOString(),
    accessToken: tokens.accessToken,
    sessionExpiresAt: tokens.sessionExpiresAt.toISOString(),
    tokenType: "Bearer",
  });
}

@Controller("v1/staff/auth")
export class StaffAuthController {
  constructor(
    private readonly authService: StaffAuthService,
    private readonly originPolicy: StaffAuthOriginPolicy,
    private readonly runner: CheckInOperationRunner,
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
    @Req() request: CheckInApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffAuthAccessResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_LOGIN", request, async () => {
      this.requireOrigin(origin);
      requireJson(contentType);
      requireEmptyQuery(rawQuery);
      const body = parse<StaffLoginRequest>(staffLoginRequestSchema, rawBody);
      const tokens = await this.authService.login(body.email, body.password);
      const result = accessResponse(tokens);
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
    @Req() request: CheckInApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<StaffAuthAccessResponse> {
    setPrivateAuthHeaders(response);
    return this.runner.run("STAFF_AUTH_REFRESH", request, async () => {
      this.requireOrigin(origin);
      requireJson(contentType);
      requireEmptyQuery(rawQuery);
      requireEmptyBody(rawBody);
      try {
        const refreshToken = readRefreshCookie(cookieHeader);
        if (refreshToken === undefined) {
          throw new StaffAuthenticationError();
        }
        const tokens = await this.authService.refresh(refreshToken);
        const result = accessResponse(tokens);
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
    @Req() request: CheckInApiRequest,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<void> {
    setPrivateAuthHeaders(response);
    await this.runner.run("STAFF_AUTH_LOGOUT", request, async () => {
      this.requireOrigin(origin);
      requireJson(contentType);
      requireEmptyQuery(rawQuery);
      requireEmptyBody(rawBody);
      await this.authService.logout(readRefreshCookie(cookieHeader));
      response.setHeader("Set-Cookie", clearRefreshCookie());
    });
  }
}
