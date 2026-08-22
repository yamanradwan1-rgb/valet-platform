import {
  abortHandoffResponseSchema,
  completeHandoffRequestSchema,
  completeHandoffResponseSchema,
  handoffReasonRequestSchema,
  handoffVersionRequestSchema,
  initiateHandoffResponseSchema,
  verifiedHandoffResponseSchema,
  verifyDynamicQrRequestSchema,
  verifyPickupCodeRequestSchema,
  type AbortHandoffResponse,
  type CompleteHandoffResponse,
  type InitiateHandoffResponse,
  type VerifiedHandoffResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import type { HandoffApiRequestOptions } from "./handoff-types";

function sessionIdPath(sessionId: string, suffix: string): string {
  return `/v1/staff/valet-sessions/${sessionId}/${suffix}`;
}

export async function initiateHandoff(
  client: EmployeeApiClient,
  sessionId: string,
  expectedSessionVersion: number,
  options: HandoffApiRequestOptions = {},
): Promise<InitiateHandoffResponse> {
  const raw = await client.request<unknown>(sessionIdPath(sessionId, "initiate-handoff"), {
    body: handoffVersionRequestSchema.parse({ expectedSessionVersion }),
    method: "POST",
    signal: options.signal,
  });
  return initiateHandoffResponseSchema.parse(raw);
}

export async function verifyPickupCode(
  client: EmployeeApiClient,
  sessionId: string,
  input: { expectedSessionVersion: number; pickupCode: string },
  options: HandoffApiRequestOptions = {},
): Promise<VerifiedHandoffResponse> {
  const parsed = verifyPickupCodeRequestSchema.parse(input);
  const raw = await client.request<unknown>(
    sessionIdPath(sessionId, "verify-pickup-code"),
    { body: parsed, method: "POST", signal: options.signal },
  );
  return verifiedHandoffResponseSchema.parse(raw);
}

export async function verifyDynamicQr(
  client: EmployeeApiClient,
  sessionId: string,
  input: { expectedSessionVersion: number; qrPayload: string },
  options: HandoffApiRequestOptions = {},
): Promise<VerifiedHandoffResponse> {
  const parsed = verifyDynamicQrRequestSchema.parse(input);
  const raw = await client.request<unknown>(
    sessionIdPath(sessionId, "verify-dynamic-qr"),
    { body: parsed, method: "POST", signal: options.signal },
  );
  return verifiedHandoffResponseSchema.parse(raw);
}

export async function supervisorOverrideHandoff(
  client: EmployeeApiClient,
  sessionId: string,
  input: { expectedSessionVersion: number; reason: string },
  options: HandoffApiRequestOptions = {},
): Promise<VerifiedHandoffResponse> {
  const parsed = handoffReasonRequestSchema.parse(input);
  const raw = await client.request<unknown>(
    sessionIdPath(sessionId, "supervisor-override-handoff"),
    { body: parsed, method: "POST", signal: options.signal },
  );
  return verifiedHandoffResponseSchema.parse(raw);
}

export async function abortHandoff(
  client: EmployeeApiClient,
  sessionId: string,
  input: { expectedSessionVersion: number; reason: string },
  options: HandoffApiRequestOptions = {},
): Promise<AbortHandoffResponse> {
  const parsed = handoffReasonRequestSchema.parse(input);
  const raw = await client.request<unknown>(
    sessionIdPath(sessionId, "abort-handoff"),
    { body: parsed, method: "POST", signal: options.signal },
  );
  return abortHandoffResponseSchema.parse(raw);
}

export async function completeHandoff(
  client: EmployeeApiClient,
  sessionId: string,
  expectedSessionVersion: number,
  options: HandoffApiRequestOptions = {},
): Promise<CompleteHandoffResponse> {
  const raw = await client.request<unknown>(
    sessionIdPath(sessionId, "complete-handoff"),
    {
      body: completeHandoffRequestSchema.parse({ expectedSessionVersion }),
      method: "POST",
      signal: options.signal,
    },
  );
  return completeHandoffResponseSchema.parse(raw);
}
