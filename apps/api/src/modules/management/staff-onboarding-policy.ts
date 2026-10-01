import { createHash } from "node:crypto";

import type { StaffOnboardingCreate } from "@valet/contracts";

import { StaffOnboardingUnavailableError } from "./staff-onboarding-errors";

export function staffActivationLink(token: string): string {
  const configured = process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
  if (configured === undefined) throw new StaffOnboardingUnavailableError();
  let origin: URL;
  try {
    origin = new URL(configured);
  } catch {
    throw new StaffOnboardingUnavailableError();
  }
  const localHttp =
    process.env.NODE_ENV !== "production" &&
    origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    (origin.protocol !== "https:" && !localHttp) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new StaffOnboardingUnavailableError();
  }
  return `${origin.origin}/staff/activate#invite=${encodeURIComponent(token)}`;
}

function digest(parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function staffOnboardingCreateFingerprint(
  organizationId: string,
  command: StaffOnboardingCreate,
): string {
  return digest([
    "staff-onboarding:create:v1",
    organizationId.toLowerCase(),
    command.firstName,
    command.lastName,
    command.email,
    command.role,
    [...command.locationIds].map((id) => id.toLowerCase()).sort(),
  ]);
}

export function staffOnboardingResendFingerprint(
  organizationId: string,
  membershipId: string,
): string {
  return digest([
    "staff-onboarding:resend:v1",
    organizationId.toLowerCase(),
    membershipId.toLowerCase(),
  ]);
}
