import { UnauthorizedException } from "@nestjs/common";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StaffManagementCommandSchema<T> {
  safeParse(value: unknown):
    | { readonly success: false }
    | { readonly data: T; readonly success: true };
}

export function requireManagementUuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

export function requireSingleManagementAuthorization(request: ApiRequest): void {
  const headers = request.rawHeaders;
  if (headers === undefined || headers.length % 2 !== 0) {
    throw new UnauthorizedException();
  }
  let count = 0;
  for (let index = 0; index < headers.length; index += 2) {
    if (headers[index]?.toLowerCase() === "authorization") count += 1;
  }
  if (count !== 1) throw new UnauthorizedException();
}
