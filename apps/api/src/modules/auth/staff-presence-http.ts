import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import type { StaffSessionContextResolver } from "./staff-session-context";
import { UnauthorizedException } from "@nestjs/common";
interface StaffManagementCommandSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}
export function requirePresenceUuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ApiTransportValidationError();
  return value;
}
function requireSingleManagementAuthorization(request: ApiRequest) {
  const headers = request.rawHeaders;
  if (headers === undefined || headers.length % 2 !== 0)
    throw new UnauthorizedException();
  let count = 0;
  for (let i = 0; i < headers.length; i += 2)
    if (headers[i]?.toLowerCase() === "authorization") count++;
  if (count !== 1) throw new UnauthorizedException();
}

export function parsePresenceCommand<T>(
  schema: StaffManagementCommandSchema<T>,
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

export async function presenceManagementHttpContext(
  request: ApiRequest,
  authorization: string | undefined,
  response: HeaderResponse,
  sessions: StaffSessionContextResolver,
) {
  setNoStoreResponseHeaders(response);
  requireSingleManagementAuthorization(request);
  return sessions.resolve(authorization);
}
