import {
  EmployeeApiError,
  employeeNetworkError,
  normalizeEmployeeApiError,
  staffNativeAuthResponseSchema,
  type StaffLoginRequest,
  type StaffNativeAuthResponse,
  type NativeStaffAuthTransport,
} from "@valet/employee-client";

import {
  readNativeResponsePayload,
  validateNativeApiOrigin,
} from "./native-api-http";

export const nativeDebugApiOrigin = "http://10.0.2.2:3001";

export class NativeAuthHttpTransport implements NativeStaffAuthTransport {
  private readonly apiOrigin: string;

  constructor(apiOrigin: string) {
    this.apiOrigin = validateNativeApiOrigin(apiOrigin);
  }

  login(request: StaffLoginRequest): Promise<StaffNativeAuthResponse> {
    return this.exchange("login", request);
  }

  refresh(refreshToken: string): Promise<StaffNativeAuthResponse> {
    return this.exchange("refresh", { refreshToken });
  }

  async logout(refreshToken: string): Promise<void> {
    const response = await this.post("logout", { refreshToken });
    const payload = await readNativeResponsePayload(response);
    if (response.status !== 204) {
      throw normalizeEmployeeApiError(response.status, payload);
    }
  }

  private async exchange(
    route: "login" | "refresh",
    body: unknown,
  ): Promise<StaffNativeAuthResponse> {
    const response = await this.post(route, body);
    const payload = await readNativeResponsePayload(response);
    if (!response.ok) {
      throw normalizeEmployeeApiError(response.status, payload);
    }
    const parsed = staffNativeAuthResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new EmployeeApiError({
        code: "NATIVE_AUTH_RESPONSE_INVALID",
        message: "Authentication response was invalid.",
        status: 502,
      });
    }
    return parsed.data;
  }

  private async post(route: string, body: unknown): Promise<Response> {
    try {
      return await fetch(`${this.apiOrigin}/v1/staff/auth/native/${route}`, {
        body: JSON.stringify(body),
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    } catch (error) {
      if (error instanceof EmployeeApiError) throw error;
      throw employeeNetworkError();
    }
  }
}
