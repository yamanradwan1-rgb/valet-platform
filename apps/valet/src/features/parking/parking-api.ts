import {
  acceptTaskResponseSchema,
  assignTaskResponseSchema,
  confirmParkedResponseSchema,
  staffValetSessionDetailResponseSchema,
  startParkingResponseSchema,
  type AcceptTaskResponse,
  type AssignTaskResponse,
  type ConfirmParkedResponse,
  type StaffValetSessionDetailResponse,
  type StartParkingResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type {
  AcceptTaskResponse,
  AssignTaskResponse,
  ConfirmParkedResponse,
  StartParkingResponse,
};

export interface ParkingApiRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

export async function fetchSessionDetail(
  client: EmployeeApiClient,
  sessionId: string,
  options: ParkingApiRequestOptions = {},
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

export async function assignParkingTask(
  client: EmployeeApiClient,
  taskId: string,
  expectedVersion: number,
  options: ParkingApiRequestOptions = {},
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
  options: ParkingApiRequestOptions = {},
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
  options: ParkingApiRequestOptions = {},
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

export async function confirmParkedSession(
  client: EmployeeApiClient,
  sessionId: string,
  expectedSessionVersion: number,
  expectedTaskVersion: number,
  parkingSpotCode: string,
  options: ParkingApiRequestOptions = {},
): Promise<ConfirmParkedResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/valet-sessions/${sessionId}/confirm-parked`,
    {
      method: "POST",
      body: {
        expectedSessionVersion,
        expectedTaskVersion,
        parkingSpotCode,
      },
      signal: options.signal,
      requireAuth: true,
    },
  );
  return confirmParkedResponseSchema.parse(raw);
}
