import {
  completeCheckInRequestSchema,
  completeCheckInResponseSchema,
  conditionCompletionResponseSchema,
  conditionNoteRequestSchema,
  conditionNoteResponseSchema,
  intakeResponseSchema,
  returningVehicleRecognitionResponseSchema,
  staffCheckInContinuationsResponseSchema,
  staffCheckInDraftsResponseSchema,
  staffValetSessionDetailResponseSchema,
  vehicleDetailsCorrectionRequestSchema,
  vehicleDetailsCorrectionResponseSchema,
  vehicleIdentityRequestSchema,
  vehicleIdentityResponseSchema,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeClient } from "./employee-client";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

function invalidResponse(): EmployeeApiError {
  return new EmployeeApiError({
    code: "CHECK_IN_RESPONSE_INVALID",
    message: "The check-in response was invalid.",
    status: 502,
  });
}

function parse<T>(
  schema: { safeParse(value: unknown): unknown },
  value: unknown,
): T {
  const parsed = schema.safeParse(value) as
    { readonly data: T; readonly success: true } | { readonly success: false };
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

export function createEmployeeCheckInTransport(
  clientOrFactory: EmployeeClient | (() => EmployeeClient),
): EmployeeCheckInTransport {
  const client = () =>
    typeof clientOrFactory === "function" ? clientOrFactory() : clientOrFactory;
  return {
    async completeCheckIn(sessionId, input) {
      const value = await client().request<unknown>({
        body: completeCheckInRequestSchema.parse(input),
        method: "POST",
        path: `/v1/staff/check-in/sessions/${sessionId}/complete`,
      });
      return parse(completeCheckInResponseSchema, value);
    },
    async completeCondition(sessionId) {
      const value = await client().request<unknown>({
        body: {},
        method: "POST",
        path: `/v1/staff/check-in/sessions/${sessionId}/condition-completion`,
      });
      return parse(conditionCompletionResponseSchema, value);
    },
    async correctDetails(sessionId, input) {
      const value = await client().request<unknown>({
        body: vehicleDetailsCorrectionRequestSchema.parse(input),
        method: "PUT",
        path: `/v1/staff/check-in/sessions/${sessionId}/vehicle-details`,
      });
      return parse(vehicleDetailsCorrectionResponseSchema, value);
    },
    async correctIdentity(sessionId, input) {
      const value = await client().request<unknown>({
        body: vehicleIdentityRequestSchema.parse(input),
        method: "PUT",
        path: `/v1/staff/check-in/sessions/${sessionId}/vehicle-identity`,
      });
      return parse(vehicleIdentityResponseSchema, value);
    },
    async createConditionNote(sessionId, input) {
      const value = await client().request<unknown>({
        body: conditionNoteRequestSchema.parse(input),
        method: "POST",
        path: `/v1/staff/check-in/sessions/${sessionId}/condition-notes`,
      });
      return parse(conditionNoteResponseSchema, value);
    },
    async createIntake(input) {
      const value = await client().request<unknown>({
        body: input,
        method: "POST",
        path: "/v1/staff/check-in/intakes",
      });
      return parse(intakeResponseSchema, value);
    },
    async loadContinuations(locationId) {
      const value = await client().request<unknown>({
        method: "GET",
        params: { locationId },
        path: "/v1/staff/check-in/continuations",
      });
      return parse(staffCheckInContinuationsResponseSchema, value);
    },
    async loadDrafts(locationId) {
      const value = await client().request<unknown>({
        method: "GET",
        params: { locationId },
        path: "/v1/staff/check-in/drafts",
      });
      return parse(staffCheckInDraftsResponseSchema, value);
    },
    async loadSession(sessionId) {
      const value = await client().request<unknown>({
        method: "GET",
        path: `/v1/staff/valet-sessions/${sessionId}`,
      });
      return parse(staffValetSessionDetailResponseSchema, value);
    },
    async recognize(input) {
      const value = await client().request<unknown>({
        body: input,
        method: "POST",
        path: "/v1/staff/check-in/vehicle-recognition",
      });
      return parse(returningVehicleRecognitionResponseSchema, value);
    },
  };
}
