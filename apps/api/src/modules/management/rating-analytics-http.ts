import { UnauthorizedException } from "@nestjs/common";
import { ratingFeedbackReadQuerySchema } from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";
import { validateAnalyticsPeriod } from "../dashboard/analytics-period";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ratingAnalyticsUuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

export function requireRatingAnalyticsAuthorization(request: ApiRequest): void {
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

export function ratingAnalyticsReadQuery(rawQuery: unknown) {
  const parsed = ratingFeedbackReadQuerySchema.safeParse(rawQuery ?? {});
  if (!parsed.success) throw new ApiTransportValidationError();
  return {
    includeComments: "includeComments" in parsed.data &&
      parsed.data.includeComments === "true",
    period: validateAnalyticsPeriod(parsed.data.from, parsed.data.to),
  };
}
