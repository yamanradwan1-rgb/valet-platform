import { vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export function createCheckInApiTestClient(
  firstResponse: unknown,
  ...remainingResponses: unknown[]
): EmployeeApiClient {
  const request = vi.fn().mockResolvedValue(firstResponse);
  if (remainingResponses.length > 0) {
    request.mockReset().mockResolvedValueOnce(firstResponse);
    for (const response of remainingResponses) {
      request.mockResolvedValueOnce(response);
    }
  }
  return { request } as unknown as EmployeeApiClient;
}
