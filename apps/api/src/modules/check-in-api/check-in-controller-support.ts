import { UnauthorizedException } from "@nestjs/common";

import type { StaffPrincipalResolver } from "../auth/staff-principal";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { CheckInApiRequest } from "./check-in-operation-runner";

interface ParseSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly data: T; readonly success: true } | { readonly success: false };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCheckInBody<T>(schema: ParseSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

export function parseCheckInEmptyBody(
  schema: ParseSchema<Record<string, never>>,
  body: unknown,
): void {
  parseCheckInBody(schema, body === undefined ? {} : body);
}

export function parseCheckInUuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

export function checkInIso(value: Date): string {
  return value.toISOString();
}

export async function resolveCheckInUserId(
  principals: StaffPrincipalResolver,
  request: CheckInApiRequest,
  authorization: string | undefined,
): Promise<string> {
  const rawHeaders = request.rawHeaders;
  let authorizationCount = 0;
  if (rawHeaders === undefined || rawHeaders.length % 2 !== 0) {
    throw new UnauthorizedException();
  }
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === "authorization") {
      authorizationCount += 1;
    }
  }
  if (authorizationCount !== 1) throw new UnauthorizedException();
  return (await principals.resolve(authorization)).userId;
}
