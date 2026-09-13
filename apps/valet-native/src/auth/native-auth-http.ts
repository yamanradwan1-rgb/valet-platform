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

/**
 * Read the bounded X-Request-Id RESPONSE header. Only the Response object
 * is consulted — never the request, its body, or its headers. The shared
 * safe-identifier rule drops whitespace, header syntax, and values over 128
 * characters.
 */
function readResponseRequestId(
  response: Response | undefined,
): string | undefined {
  if (response === undefined) return undefined;
  try {
    const value = response.headers.get("x-request-id");
    if (value === null) return undefined;
    return isSafeTelemetryRequestId(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function recordAuthTelemetry(
  kind: NativeAuthTelemetryKind,
  outcome: "error" | "success",
  options: {
    readonly errorCode?: string | undefined;
    /** Bounded X-Request-Id from the RESPONSE, when safely known. */
    readonly requestId?: string | undefined;
  } = {},
): void {
  // Fail-open: the owner swallows every sink error itself.
  //
  // `operation` is deliberately OMITTED on auth events: the shared closed
  // operation table covers HTTP surface operations only (it has no auth
  // values by design). Source "auth" already identifies the surface and
  // `classification` identifies the action (login/refresh/logout), so the
  // optional operation slot legitimately stays unset here.
  getNativeTelemetry().record({
    classification: kind,
    errorCode:
      typeof options.errorCode === "string" &&
      isSafeTelemetryRequestId(options.errorCode)
        ? options.errorCode
        : undefined,
    outcome,
    requestId:
      typeof options.requestId === "string" &&
      isSafeTelemetryRequestId(options.requestId)
        ? options.requestId
        : undefined,
    source: "auth",
  });
}

/** Error-path telemetry with the bounded response header correlation. */
function recordAuthTelemetryFailure(
  kind: NativeAuthTelemetryKind,
  error: unknown,
  response: Response | undefined,
): void {
  recordAuthTelemetry(kind, "error", {
    errorCode: error instanceof EmployeeApiError ? error.code : undefined,
    // A network failure never produced a Response: no requestId (omitted).
    // An error that came from a response correlates that response's header.
    requestId: readResponseRequestId(response),
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
    // The Response object is kept in scope so the error path can correlate
    // its bounded X-Request-Id header without changing any thrown error.
    let response: Response | undefined;
    try {
      response = await this.post("logout", { refreshToken });
      const payload = await readNativeResponsePayload(response);
      if (response.status !== 204) {
        throw normalizeEmployeeApiError(response.status, payload);
      }
      recordAuthTelemetry("logout", "success", {
        requestId: readResponseRequestId(response),
      });
    } catch (error) {
      // Business behavior is unchanged: rethrow the original error exactly.
      recordAuthTelemetryFailure("logout", error, response);
      throw error;
    }
  }

  private async exchange(
    route: "login" | "refresh",
    body: unknown,
  ): Promise<StaffNativeAuthResponse> {
    // The Response object is kept in scope so the error path can correlate
    // its bounded X-Request-Id header without changing any thrown error.
    let response: Response | undefined;
    try {
      response = await this.post(route, body);
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
      recordAuthTelemetry(route, "success", {
        requestId: readResponseRequestId(response),
      });
      return parsed.data;
    } catch (error) {
      recordAuthTelemetryFailure(route, error, response);
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
