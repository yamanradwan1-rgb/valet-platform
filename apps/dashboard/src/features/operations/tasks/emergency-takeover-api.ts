import {
  emergencyTakeoverContextResponseSchema,
  emergencyTakeoverRequestSchema,
  emergencyTakeoverResponseSchema,
  type EmergencyTakeoverRequest,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { dashboardMalformedError } from "../../../lib/api/dashboard-api-error";

function taskPath(taskId: string) {
  return `/v1/staff/tasks/${encodeURIComponent(taskId)}`;
}

export function readEmergencyTakeoverContext(
  api: DashboardApiClient,
  taskId: string,
  signal?: AbortSignal,
  search?: string,
) {
  return api.request(
    taskPath(taskId) + "/emergency-takeover-context",
    emergencyTakeoverContextResponseSchema,
    { method: "GET", signal, ...(search?.trim() ? { query: { search: search.trim() } } : {}) },
  );
}

export async function submitEmergencyTakeover(
  api: DashboardApiClient,
  taskId: string,
  request: EmergencyTakeoverRequest,
) {
  const body = emergencyTakeoverRequestSchema.parse(request);
  const receipt = await api.request(
    taskPath(taskId) + "/emergency-takeover",
    emergencyTakeoverResponseSchema,
    { method: "POST", body },
  );
  if (
    receipt.operationId !== body.operationId ||
    receipt.task.id !== taskId ||
    receipt.task.assigneeMembershipId !== body.targetAssigneeMembershipId
  ) {
    throw dashboardMalformedError();
  }
  return receipt;
}
