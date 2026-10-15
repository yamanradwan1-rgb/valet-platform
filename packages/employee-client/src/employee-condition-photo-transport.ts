import {
  conditionPhotoStateDiscoverySchema,
  conditionPhotoUploadStatusSchema,
  type ConditionPhotoStateDiscovery,
  type ConditionPhotoUploadStatus,
} from "@valet/contracts";
import type { EmployeeClient } from "./employee-client";

export interface ConditionPhotoTransport {
  discover(sessionId: string, signal: AbortSignal): Promise<ConditionPhotoStateDiscovery>;
  status(sessionId: string, operationId: string, signal: AbortSignal): Promise<ConditionPhotoUploadStatus>;
  reconcile(sessionId: string, operationId: string, signal: AbortSignal): Promise<ConditionPhotoUploadStatus>;
  upload(sessionId: string, operationId: string, handle: string, signal: AbortSignal): Promise<ConditionPhotoUploadStatus>;
}

/** The portable transport never handles file paths, FormData or device APIs. */
export function createEmployeeConditionPhotoTransport(
  client: (signal: AbortSignal) => EmployeeClient,
  multipart: (operationId: string, handle: string) => unknown,
): ConditionPhotoTransport {
  const base = (sessionId: string) =>
    `/v1/staff/check-in/sessions/${encodeURIComponent(sessionId)}`;
  const operationPath = (sessionId: string, operationId: string) =>
    `${base(sessionId)}/condition-photo-uploads/${encodeURIComponent(operationId)}`;
  const checkedStatus = (value: unknown, sessionId: string, operationId: string) => {
    const result = conditionPhotoUploadStatusSchema.parse(value);
    if (result.valetSessionId !== sessionId || result.operationId !== operationId)
      throw new Error("Condition photo response scope mismatch.");
    return result;
  };
  return {
    async discover(sessionId, signal) {
      const value = await client(signal).request<unknown>({
        method: "GET", path: `${base(sessionId)}/condition-photo-state`,
      });
      const result = conditionPhotoStateDiscoverySchema.parse(value);
      if (result.valetSessionId !== sessionId)
        throw new Error("Condition photo discovery scope mismatch.");
      return result;
    },
    async status(sessionId, operationId, signal) {
      const value = await client(signal).request<unknown>({
        method: "GET", path: operationPath(sessionId, operationId),
      });
      return checkedStatus(value, sessionId, operationId);
    },
    async reconcile(sessionId, operationId, signal) {
      const value = await client(signal).request<unknown>({
        method: "POST", path: `${operationPath(sessionId, operationId)}/reconcile`, body: {},
      });
      return checkedStatus(value, sessionId, operationId);
    },
    async upload(sessionId, operationId, handle, signal) {
      const value = await client(signal).request<unknown>({
        method: "POST", path: `${base(sessionId)}/condition-photo-uploads`,
        body: multipart(operationId, handle),
      });
      return checkedStatus(value, sessionId, operationId);
    },
  };
}
