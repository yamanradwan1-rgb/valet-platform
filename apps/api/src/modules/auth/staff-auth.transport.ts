import {
  emptyRequestSchema,
  staffAuthAccessResponseSchema,
  staffNativeAuthResponseSchema,
  type StaffAuthAccessResponse,
  type StaffNativeAuthResponse,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { StaffAuthTokens } from "./staff-auth.service";

export interface AuthResponse {
  setHeader(name: string, value: string): void;
}

export interface ParseSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly data: T; readonly success: true } | { readonly success: false };
}

export function parseAuthBody<T>(schema: ParseSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

export function requireAuthJson(contentType: string | undefined): void {
  if (
    contentType === undefined ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
  ) {
    throw new ApiTransportValidationError();
  }
}

export function requireEmptyAuthQuery(query: unknown): void {
  parseAuthBody(emptyRequestSchema, query === undefined ? {} : query);
}

export function setPrivateAuthHeaders(response: AuthResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
}

export function webAccessResponse(
  tokens: StaffAuthTokens,
): StaffAuthAccessResponse {
  return staffAuthAccessResponseSchema.parse({
    accessExpiresAt: tokens.accessExpiresAt.toISOString(),
    accessToken: tokens.accessToken,
    sessionExpiresAt: tokens.sessionExpiresAt.toISOString(),
    tokenType: "Bearer",
  });
}

export function nativeAccessResponse(
  tokens: StaffAuthTokens,
): StaffNativeAuthResponse {
  return staffNativeAuthResponseSchema.parse({
    ...webAccessResponse(tokens),
    refreshToken: tokens.refreshToken,
  });
}
