import {
  acceptTaskResponseSchema,
  assignTaskResponseSchema,
  markReadyResponseSchema,
  staffValetSessionDetailResponseSchema,
  startRetrievalResponseSchema,
  type AcceptTaskResponse,
  type AssignTaskResponse,
  type StaffValetSessionDetailResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type StartRetrievalResponse = ReturnType<
  typeof startRetrievalResponseSchema.parse
>;
export type MarkReadyResponse = ReturnType<
  typeof markReadyResponseSchema.parse
>;

export type {
  AcceptTaskResponse,
  AssignTaskResponse,
  StaffValetSessionDetailResponse,
};

export interface RetrievalApiRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

export async function fetchSessionDetail(
  client: EmployeeApiClient,
  sessionId: string,
  options: RetrievalApiRequestOptions = {},
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

export async function assignRetrievalTask(
  client: EmployeeApiClient,
  taskId: string,
  expectedVersion: number,
  options: RetrievalApiRequestOptions = {},
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

export async function acceptRetrievalTask(
  client: EmployeeApiClient,
  taskId: string,
  expectedVersion: number,
  options: RetrievalApiRequestOptions = {},
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

export async function startRetrievalSession(
  client: EmployeeApiClient,
  sessionId: string,
  expectedSessionVersion: number,
  expectedTaskVersion: number,
  options: RetrievalApiRequestOptions = {},
): Promise<StartRetrievalResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/valet-sessions/${sessionId}/start-retrieval`,
    {
      method: "POST",
      body: { expectedSessionVersion, expectedTaskVersion },
      signal: options.signal,
      requireAuth: true,
    },
  );
  return startRetrievalResponseSchema.parse(raw);
}

export async function markReadySession(
  client: EmployeeApiClient,
  sessionId: string,
  expectedSessionVersion: number,
  options: RetrievalApiRequestOptions = {},
): Promise<MarkReadyResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/valet-sessions/${sessionId}/mark-ready`,
    {
      method: "POST",
      body: { expectedSessionVersion },
      signal: options.signal,
      requireAuth: true,
    },
  );
  return markReadyResponseSchema.parse(raw);
}
