import {
  acceptTaskResponseSchema,
  assignTaskResponseSchema,
  completeCheckInResponseSchema,
  conditionCompletionResponseSchema,
  conditionNoteResponseSchema,
  intakeResponseSchema,
  parkingTaskQueueResponseSchema,
  returningVehicleRecognitionRequestSchema,
  returningVehicleRecognitionResponseSchema,
  staffCheckInContinuationsResponseSchema,
  staffCheckInDraftsResponseSchema,
  startParkingResponseSchema,
  vehicleDetailsCorrectionRequestSchema,
  vehicleDetailsCorrectionResponseSchema,
  vehicleIdentityResponseSchema,
  type AcceptTaskResponse,
  type AssignTaskResponse,
  type CompleteCheckInResponse,
  type ConditionCompletionResponse,
  type ConditionNoteRequest,
  type ConditionNoteResponse,
  type IntakeRequest,
  type IntakeResponse,
  type ParkingTaskQueueResponse,
  type ReturningVehicleRecognitionRequest,
  type ReturningVehicleRecognitionResponse,
  type StaffCheckInContinuationsResponse,
  type StaffCheckInDraftsResponse,
  type StaffValetSessionDetailResponse,
  type StartParkingResponse,
  type VehicleDetailsCorrectionRequest,
  type VehicleDetailsCorrectionResponse,
  type VehicleIdentityRequest,
  type VehicleIdentityResponse,
} from "@valet/contracts";

import { fetchStaffSessionDetail } from "../staff-session";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type {
  AcceptTaskResponse,
  AssignTaskResponse,
  CompleteCheckInResponse,
  ConditionCompletionResponse,
  ConditionNoteRequest,
  ConditionNoteResponse,
  IntakeResponse,
  ParkingTaskQueueResponse,
  ReturningVehicleRecognitionResponse,
  StartParkingResponse,
  VehicleDetailsCorrectionResponse,
  VehicleIdentityRequest,
  VehicleIdentityResponse,
};

export async function recognizeReturningVehicle(
  client: EmployeeApiClient,
  request: ReturningVehicleRecognitionRequest,
  options: CheckInApiRequestOptions = {},
): Promise<ReturningVehicleRecognitionResponse> {
  const body = returningVehicleRecognitionRequestSchema.parse(request);
  const raw = await client.request<unknown>(
    "/v1/staff/check-in/vehicle-recognition",
    {
      method: "POST",
      body,
      signal: options.signal,
      requireAuth: true,
    },
  );
  return returningVehicleRecognitionResponseSchema.parse(raw);
}

export async function correctSessionVehicleDetails(
  client: EmployeeApiClient,
  sessionId: string,
  request: VehicleDetailsCorrectionRequest,
  options: CheckInApiRequestOptions = {},
): Promise<VehicleDetailsCorrectionResponse> {
  const body = vehicleDetailsCorrectionRequestSchema.parse(request);
  const raw = await client.request<unknown>(
    `/v1/staff/check-in/sessions/${sessionId}/vehicle-details`,
    {
      method: "PUT",
      body,
      signal: options.signal,
      requireAuth: true,
    },
  );
  return vehicleDetailsCorrectionResponseSchema.parse(raw);
}

export interface CheckInApiRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

export async function fetchCheckInDrafts(
  client: EmployeeApiClient,
  locationId: string,
  options: CheckInApiRequestOptions = {},
): Promise<StaffCheckInDraftsResponse> {
  const raw = await client.request<unknown>("/v1/staff/check-in/drafts", {
    method: "GET",
    params: { locationId },
    signal: options.signal,
    requireAuth: true,
  });
  return staffCheckInDraftsResponseSchema.parse(raw);
}

export async function fetchCheckInContinuations(
  client: EmployeeApiClient,
  locationId: string,
  options: CheckInApiRequestOptions = {},
): Promise<StaffCheckInContinuationsResponse> {
  const raw = await client.request<unknown>(
    "/v1/staff/check-in/continuations",
    {
      method: "GET",
      params: { locationId },
      signal: options.signal,
      requireAuth: true,
    },
  );
  return staffCheckInContinuationsResponseSchema.parse(raw);
}

export async function fetchSessionDetail(
  client: EmployeeApiClient,
  sessionId: string,
  options: CheckInApiRequestOptions = {},
): Promise<StaffValetSessionDetailResponse> {
  // Delegates to the reusable staff-session boundary; the Check-In public
  // contract is unchanged.
  return fetchStaffSessionDetail(client, sessionId, options);
}

export async function createIntakeSession(
  client: EmployeeApiClient,
  request: IntakeRequest,
  options: CheckInApiRequestOptions = {},
): Promise<IntakeResponse> {
  const raw = await client.request<unknown>("/v1/staff/check-in/intakes", {
    method: "POST",
    body: request,
    signal: options.signal,
    requireAuth: true,
  });
  return intakeResponseSchema.parse(raw);
}

export async function updateSessionVehicleIdentity(
  client: EmployeeApiClient,
  sessionId: string,
  request: VehicleIdentityRequest,
  options: CheckInApiRequestOptions = {},
): Promise<VehicleIdentityResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/check-in/sessions/${sessionId}/vehicle-identity`,
    {
      method: "PUT",
      body: request,
      signal: options.signal,
      requireAuth: true,
    },
  );
  return vehicleIdentityResponseSchema.parse(raw);
}

export async function createSessionConditionNote(
  client: EmployeeApiClient,
  sessionId: string,
  request: ConditionNoteRequest,
  options: CheckInApiRequestOptions = {},
): Promise<ConditionNoteResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/check-in/sessions/${sessionId}/condition-notes`,
    {
      method: "POST",
      body: request,
      signal: options.signal,
      requireAuth: true,
    },
  );
  return conditionNoteResponseSchema.parse(raw);
}

export async function completeConditionStep(
  client: EmployeeApiClient,
  sessionId: string,
  options: CheckInApiRequestOptions = {},
): Promise<ConditionCompletionResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/check-in/sessions/${sessionId}/condition-completion`,
    {
      method: "POST",
      body: {},
      signal: options.signal,
      requireAuth: true,
    },
  );
  return conditionCompletionResponseSchema.parse(raw);
}

export async function completeCheckInSession(
  client: EmployeeApiClient,
  sessionId: string,
  expectedVersion: number,
  options: CheckInApiRequestOptions = {},
): Promise<CompleteCheckInResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/check-in/sessions/${sessionId}/complete`,
    {
      method: "POST",
      body: { expectedVersion },
      signal: options.signal,
      requireAuth: true,
    },
  );
  return completeCheckInResponseSchema.parse(raw);
}

export async function queueSessionParkingTask(
  client: EmployeeApiClient,
  sessionId: string,
  options: CheckInApiRequestOptions = {},
): Promise<ParkingTaskQueueResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/valet-sessions/${sessionId}/parking-task/queue`,
    {
      method: "POST",
      body: {},
      signal: options.signal,
      requireAuth: true,
    },
  );
  return parkingTaskQueueResponseSchema.parse(raw);
}

export async function assignParkingTask(
  client: EmployeeApiClient,
  taskId: string,
  expectedVersion: number,
  options: CheckInApiRequestOptions = {},
): Promise<AssignTaskResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/tasks/${taskId}/assign`,
    {
      method: "POST",
      body: { expectedVersion },
      signal: options.signal,
      requireAuth: true,
    },
  );
  return assignTaskResponseSchema.parse(raw);
}

export async function acceptParkingTask(
  client: EmployeeApiClient,
  taskId: string,
  expectedVersion: number,
  options: CheckInApiRequestOptions = {},
): Promise<AcceptTaskResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/tasks/${taskId}/accept`,
    {
      method: "POST",
      body: { expectedVersion },
      signal: options.signal,
      requireAuth: true,
    },
  );
  return acceptTaskResponseSchema.parse(raw);
}

export async function startParkingSession(
  client: EmployeeApiClient,
  sessionId: string,
  expectedSessionVersion: number,
  expectedTaskVersion: number,
  options: CheckInApiRequestOptions = {},
): Promise<StartParkingResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/valet-sessions/${sessionId}/start-parking`,
    {
      method: "POST",
      body: { expectedSessionVersion, expectedTaskVersion },
      signal: options.signal,
      requireAuth: true,
    },
  );
  return startParkingResponseSchema.parse(raw);
}
