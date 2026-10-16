/** Server-only Staff API rewrite policy for Employee Web. */
export const EMPLOYEE_DEVELOPMENT_API_ORIGIN = "http://localhost:3001";
export const EMPLOYEE_STAFF_API_REWRITE_SOURCE = "/v1/staff/:path*";

export interface EmployeeApiOriginEnvironment {
  readonly apiOrigin: string | undefined;
  readonly nodeEnv: string | undefined;
}

export function resolveEmployeeApiOrigin(environment: EmployeeApiOriginEnvironment): string {
  const value = environment.apiOrigin?.trim();
  if (!value) {
    if (environment.nodeEnv === "production") {
      throw new Error("Employee API_ORIGIN configuration error: API_ORIGIN is required in production.");
    }
    return EMPLOYEE_DEVELOPMENT_API_ORIGIN;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Employee API_ORIGIN configuration error: expected an absolute HTTP(S) origin.");
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    !/^https?:\/\/[^/?#\\]+\/?$/i.test(value) ||
    parsed.username !== "" || parsed.password !== "" ||
    parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== ""
  ) {
    throw new Error("Employee API_ORIGIN configuration error: invalid HTTP(S) origin shape.");
  }

  if (
    environment.nodeEnv === "production" && parsed.protocol === "http:" &&
    !/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/i.test(value)
  ) {
    throw new Error("Employee API_ORIGIN configuration error: production requires HTTPS or explicit same-host loopback.");
  }

  return parsed.origin;
}

export function employeeStaffApiRewriteDestination(environment: EmployeeApiOriginEnvironment): string {
  return `${resolveEmployeeApiOrigin(environment)}/v1/staff/:path*`;
}
