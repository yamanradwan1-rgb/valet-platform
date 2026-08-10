import { Injectable } from "@nestjs/common";

export const STAFF_AUTH_ALLOWED_ORIGINS_ENV = "STAFF_AUTH_ALLOWED_ORIGINS";

export function parseStaffAuthAllowedOrigins(
  configured = process.env[STAFF_AUTH_ALLOWED_ORIGINS_ENV],
): ReadonlySet<string> {
  if (configured === undefined || configured.trim() === "") return new Set();

  const origins = new Set<string>();
  for (const candidate of configured.split(",")) {
    const value = candidate.trim();
    if (value === "" || value === "*") {
      throw new Error("Staff authentication requires explicit allowed origins.");
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Staff authentication received an invalid allowed origin.");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.origin !== value
    ) {
      throw new Error("Staff authentication requires canonical HTTP origins.");
    }
    origins.add(value);
  }
  return origins;
}

@Injectable()
export class StaffAuthOriginPolicy {
  readonly allowedOrigins = parseStaffAuthAllowedOrigins();

  allows(origin: string | undefined): origin is string {
    return origin !== undefined && this.allowedOrigins.has(origin);
  }
}
