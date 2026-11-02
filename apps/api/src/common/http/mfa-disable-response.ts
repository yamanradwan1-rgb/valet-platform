import { UnauthorizedException } from "@nestjs/common";
import { apiHttpException, mapApiError } from "./api-errors";
import type { HeaderResponse } from "./no-store-response";

export function privateMfaDisableResponse(
  operation: string,
  response: HeaderResponse,
): void {
  if (
    operation === "STAFF_AUTH_MFA_DISABLE" ||
    operation === "STAFF_AUTH_MFA_DISABLE_AVAILABILITY"
  ) {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Pragma", "no-cache");
  }
}

export function normalizeMfaDisableException(
  exception: unknown,
  operation: string,
  requestId: string,
): unknown {
  // The global GET User-revalidation interceptor runs after the operation runner.
  if (
    operation === "STAFF_AUTH_MFA_DISABLE_AVAILABILITY" &&
    exception instanceof UnauthorizedException
  ) {
    return apiHttpException(mapApiError(exception), requestId);
  }
  return exception;
}
