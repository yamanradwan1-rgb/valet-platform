import {
  acceptTaskResponseSchema,
  assignKeySlotResponseSchema,
  completeCheckInResponseSchema,
  conditionCompletionResponseSchema,
  intakeResponseSchema,
  parkingTaskQueueResponseSchema,
  staffCheckInContinuationsResponseSchema,
  staffCheckInDraftsResponseSchema,
  staffValetSessionDetailResponseSchema,
  startParkingResponseSchema,
  type AcceptTaskResponse,
  type AssignKeySlotResponse,
  type CompleteCheckInResponse,
  type ConditionCompletionResponse,
  type IntakeRequest,
  type IntakeResponse,
  type ParkingTaskQueueResponse,
  type StaffCheckInContinuationsResponse,
  type StaffCheckInDraftsResponse,
  type StaffValetSessionDetailResponse,
  type StartParkingResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type {
  AcceptTaskResponse,
  AssignKeySlotResponse,
  CompleteCheckInResponse,
  ConditionCompletionResponse,
  IntakeResponse,
  ParkingTaskQueueResponse,
  StartParkingResponse,
};

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
  const raw = await client.request<unknown>(
    `/v1/staff/valet-sessions/${sessionId}`,
    {
      method: "GET",
      signal: options.signal,
      requireAuth: true,
    },
  );
  return staffValetSessionDetailResponseSchema.parse(raw);
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

export async function assignSessionKeySlot(
  client: EmployeeApiClient,
  sessionId: string,
  expectedVersion: number,
  keySlotCode: string,
  options: CheckInApiRequestOptions = {},
): Promise<AssignKeySlotResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/valet-sessions/${sessionId}/key-slot/assign`,
    {
      method: "POST",
      body: { expectedVersion, keySlotCode },
      signal: options.signal,
      requireAuth: true,
    },
  );
  return assignKeySlotResponseSchema.parse(raw);
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
