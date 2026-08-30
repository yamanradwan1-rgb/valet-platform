import { UnauthorizedException } from "@nestjs/common";
import {
  emptyRequestSchema,
  webPushSubscriptionRequestSchema,
  type WebPushSubscriptionRequest,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";
import { GuestAccessError } from "../valet-sessions/guest-access-command";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const staffBearerPattern = /^Bearer vsa1\.[A-Za-z0-9_-]{43}$/;
const guestBearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/;

function authorizationCount(request: ApiRequest): number {
  const headers = request.rawHeaders;
  if (headers === undefined || headers.length % 2 !== 0) return 0;
  let count = 0;
  for (let index = 0; index < headers.length; index += 2) {
    if (headers[index]?.toLowerCase() === "authorization") count += 1;
  }
  return count;
}

export function parseStaffAuthorization(
  request: ApiRequest,
  authorization: string | undefined,
): string {
  if (
    authorizationCount(request) !== 1 ||
    authorization === undefined ||
    !staffBearerPattern.test(authorization)
  ) {
    throw new UnauthorizedException();
  }
  return authorization;
}

export function parseGuestToken(
  request: ApiRequest,
  authorization: string | undefined,
): string | undefined {
  if (authorizationCount(request) !== 1) return undefined;
  return guestBearerPattern.exec(authorization ?? "")?.[1];
}

export function requireGuestToken(rawToken: string | undefined): string {
  if (rawToken === undefined)
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  return rawToken;
}

export function parseSubscriptionId(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

export function parseSubscriptionBody(
  contentType: string | undefined,
  body: unknown,
): WebPushSubscriptionRequest {
  if (
    contentType === undefined ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
  ) {
    throw new ApiTransportValidationError();
  }
  const parsed = webPushSubscriptionRequestSchema.safeParse(body);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

export function requireEmpty(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value ?? {}).success) {
    throw new ApiTransportValidationError();
  }
}
