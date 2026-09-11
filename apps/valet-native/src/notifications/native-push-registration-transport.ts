import {
  staffPushRegistrationResponseSchema,
  type StaffPushRegistrationRequest,
  type StaffPushRegistrationResponse,
} from "@valet/contracts";
import {
  EmployeeApiError,
  type NativeAuthSession,
} from "@valet/employee-client";

import { createNativeEmployeeClient } from "../tasks/native-operational-http";
import type { NativePushRegistrationTransport } from "./native-push-types";

export class NativePushHttpRegistrationTransport implements NativePushRegistrationTransport {
  constructor(
    private readonly apiOrigin: string,
    private readonly auth: NativeAuthSession,
  ) {}

  async reconcile(
    request: StaffPushRegistrationRequest,
  ): Promise<StaffPushRegistrationResponse> {
    const response = await createNativeEmployeeClient(
      this.apiOrigin,
      this.auth,
    ).request<unknown>({
      body: request,
      method: "PUT",
      path: "/v1/staff/push/registrations",
    });
    const parsed = staffPushRegistrationResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new EmployeeApiError({
        code: "NATIVE_PUSH_RESPONSE_INVALID",
        message: "Push registration response was invalid.",
        status: 502,
      });
    }
    return parsed.data;
  }
}
