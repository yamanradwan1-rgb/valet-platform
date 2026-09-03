import {
  EmployeeApiError,
  employeeNetworkError,
  normalizeEmployeeApiError,
  staffNativeAuthResponseSchema,
  type StaffLoginRequest,
  type StaffNativeAuthResponse,
  type NativeStaffAuthTransport,
} from "@valet/employee-client";

export const nativeDebugApiOrigin = "http://10.0.2.2:3001";

function validatedApiOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Native API origin is not configured safely.");
  }
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== "/"
  ) {
    throw new Error("Native API origin is not configured safely.");
  }
  if (
    parsed.protocol !== "https:" &&
    !(__DEV__ && parsed.protocol === "http:")
  ) {
    throw new Error("Native release authentication requires HTTPS.");
  }
  return parsed.origin;
}

async function responsePayload(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw employeeNetworkError();
  }
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export class NativeAuthHttpTransport implements NativeStaffAuthTransport {
  private readonly apiOrigin: string;

  constructor(apiOrigin: string) {
    this.apiOrigin = validatedApiOrigin(apiOrigin);
  }

  login(request: StaffLoginRequest): Promise<StaffNativeAuthResponse> {
    return this.exchange("login", request);
  }

  refresh(refreshToken: string): Promise<StaffNativeAuthResponse> {
    return this.exchange("refresh", { refreshToken });
  }

  async logout(refreshToken: string): Promise<void> {
    const response = await this.post("logout", { refreshToken });
    const payload = await responsePayload(response);
    if (response.status !== 204) {
      throw normalizeEmployeeApiError(response.status, payload);
    }
  }

  private async exchange(
    route: "login" | "refresh",
    body: unknown,
  ): Promise<StaffNativeAuthResponse> {
    const response = await this.post(route, body);
    const payload = await responsePayload(response);
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
