import { LOCAL_SMOKE_EMPLOYEE_PASSWORD } from "../local-dev/demo-employee-credential";
import { requestJson } from "./capacity-http";

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null)
    throw new Error("Response is not JSON.");
  return value as Record<string, unknown>;
}

function requireAuth(body: unknown): {
  accessToken: string;
  refreshToken: string;
} {
  const value = requireObject(body);
  if (
    typeof value.accessToken !== "string" ||
    typeof value.refreshToken !== "string"
  ) {
    throw new Error("Authentication response contract failed.");
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken };
}

export async function capacityLogin(baseUrl: string, email: string) {
  const response = await requestJson(
    baseUrl,
    "auth-login",
    "POST",
    "/v1/staff/auth/native/login",
    { body: { email, password: LOCAL_SMOKE_EMPLOYEE_PASSWORD } },
  );
  return {
    auth:
      response.sample.status === 200 ? requireAuth(response.body) : undefined,
    sample: response.sample,
  };
}

export const parseCapacityAuth = requireAuth;
