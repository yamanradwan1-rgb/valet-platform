import type { ApiRequest } from "../../common/http/api-request";

const bearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/;

export function shapeValidGuestBearer(
  request: ApiRequest,
  value: string | undefined,
): string | undefined {
  const rawHeaders = request.rawHeaders;
  if (rawHeaders === undefined || rawHeaders.length % 2 !== 0) return undefined;

  let authorizationCount = 0;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === "authorization") {
      authorizationCount += 1;
    }
  }
  if (authorizationCount !== 1) return undefined;

  const match = typeof value === "string" ? bearerPattern.exec(value) : null;
  return match?.[1];
}
