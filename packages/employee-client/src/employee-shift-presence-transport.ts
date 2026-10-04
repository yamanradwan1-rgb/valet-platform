import {
  endShiftRequestSchema,
  endShiftResponseSchema,
  shiftPresenceChallengeIntentSchema,
  shiftPresenceChallengeResponseSchema,
  shiftPresenceExceptionCreateRequestSchema,
  shiftPresenceExceptionResponseSchema,
  shiftPresenceRecoveryResponseSchema,
  startShiftRequestSchema,
  startShiftResponseSchema,
} from "@valet/contracts";
import { EmployeeApiError } from "./api-error";
import type {
  EmployeeClient,
  EmployeeTransportRequest,
} from "./employee-client";
import type { PresenceTransport } from "./employee-shift-presence-types";

const root = "/v1/staff/shifts/presence";

export function createEmployeeShiftPresenceTransport(
  client: () => EmployeeClient,
): PresenceTransport {
  async function read<T>(
    request: EmployeeTransportRequest,
    schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  ): Promise<T> {
    const value = await client().request<unknown>(request);
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new EmployeeApiError({
        code: "PRESENCE_RESPONSE_INVALID",
        message: "Presence response was invalid.",
        status: 502,
      });
    return parsed.data!;
  }
  return {
    challenge: (intent) =>
      read(
        {
          method: "POST",
          path: `${root}/challenges`,
          body: shiftPresenceChallengeIntentSchema.parse(intent),
        },
        shiftPresenceChallengeResponseSchema,
      ),
    readChallenge: (operationId) =>
      read(
        { method: "GET", path: `${root}/operations/${operationId}/challenge` },
        shiftPresenceChallengeResponseSchema,
      ),
    recover: (operationId) =>
      read(
        { method: "GET", path: `${root}/operations/${operationId}` },
        shiftPresenceRecoveryResponseSchema,
      ),
    requestException: (operationId, challengeId, reason) =>
      read(
        {
          method: "POST",
          path: `${root}/operations/${operationId}/exception`,
          body: shiftPresenceExceptionCreateRequestSchema.parse({
            challengeId,
            reason,
          }),
        },
        shiftPresenceExceptionResponseSchema,
      ),
    readException: (exceptionId) =>
      read(
        { method: "GET", path: `${root}/exceptions/${exceptionId}` },
        shiftPresenceExceptionResponseSchema,
      ),
    async submit(target, operationId, presence) {
      const evidence = presence === undefined ? {} : { presence };
      return target.action === "START"
        ? read(
            {
              method: "POST",
              path: "/v1/staff/shifts/start",
              body: startShiftRequestSchema.parse({
                targetLocationId: target.locationId,
                operationId,
                ...evidence,
              }),
            },
            startShiftResponseSchema,
          )
        : read(
            {
              method: "POST",
              path: `/v1/staff/shifts/${target.shiftId}/end`,
              body: endShiftRequestSchema.parse({
                cashReported: target.cashReported,
                operationId,
                ...evidence,
              }),
            },
            endShiftResponseSchema,
          );
    },
  };
}
