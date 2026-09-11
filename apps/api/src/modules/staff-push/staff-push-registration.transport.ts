import {
  emptyRequestSchema,
  staffPushRegistrationIdSchema,
  staffPushRegistrationRequestSchema,
  staffPushRegistrationResponseSchema,
  type StaffPushRegistrationRequest,
  type StaffPushRegistrationResponse,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";

function parse<T>(
  schema: {
    safeParse(value: unknown): { data: T; success: true } | { success: false };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

export function requirePushJson(contentType: string | undefined): void {
  if (
    contentType === undefined ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
  ) {
    throw new ApiTransportValidationError();
  }
}

export function requireEmptyPushQuery(query: unknown): void {
  parse(emptyRequestSchema, query === undefined ? {} : query);
}

export function parseRegistrationRequest(
  value: unknown,
): StaffPushRegistrationRequest {
  return parse(staffPushRegistrationRequestSchema, value);
}

export function parseRegistrationId(value: unknown): string {
  return parse(staffPushRegistrationIdSchema, value);
}

export function requireEmptyDisableBody(value: unknown): void {
  parse(emptyRequestSchema, value === undefined ? {} : value);
}

export function parseRegistrationResponse(
  value: StaffPushRegistrationResponse,
): StaffPushRegistrationResponse {
  return parse(staffPushRegistrationResponseSchema, value);
}
