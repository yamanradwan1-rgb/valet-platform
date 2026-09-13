import {
  EmployeeApiError,
  employeeNetworkError,
  isSafeTelemetryRequestId,
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
import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";

/** Closed auth classification for this transport's routes. */
type NativeAuthTelemetryKind = "login" | "refresh" | "logout";

function recordAuthTelemetry(
  kind: NativeAuthTelemetryKind,
  outcome: "error" | "success",
  errorCode?: string,
): void {
  // Fail-open: the owner swallows every sink error itself.
  getNativeTelemetry().record({
    classification: kind,
    errorCode:
      typeof errorCode === "string" && isSafeTelemetryRequestId(errorCode)
        ? errorCode
        : undefined,
    outcome,
    source: "auth",
  });
}

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
    try {
      const response = await this.post("logout", { refreshToken });
      const payload = await readNativeResponsePayload(response);
      if (response.status !== 204) {
        throw normalizeEmployeeApiError(response.status, payload);
      }
      recordAuthTelemetry("logout", "success");
    } catch (error) {
      // Business behavior is unchanged: rethrow the original error exactly.
      recordAuthTelemetry(
        "logout",
        "error",
        error instanceof EmployeeApiError ? error.code : undefined,
      );
      throw error;
    }
  }

  private async exchange(
    route: "login" | "refresh",
    body: unknown,
  ): Promise<StaffNativeAuthResponse> {
    try {
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
      recordAuthTelemetry(route, "success");
      return parsed.data;
    } catch (error) {
      recordAuthTelemetry(
        route,
        "error",
        error instanceof EmployeeApiError ? error.code : undefined,
      );
      throw error;
    }
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
