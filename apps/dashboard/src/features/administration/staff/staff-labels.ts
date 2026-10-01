import type { StaffManagementRole } from "@valet/contracts";

import type { AdministrationCopy } from "../administration-copy";
import { staffOnboardingCopy } from "./staff-onboarding-copy";

export function staffRoleLabel(
  role: StaffManagementRole,
  t: AdministrationCopy,
): string {
  if (role === "ORG_ADMIN") return t.companyAdmin;
  if (role === "LOCATION_MANAGER") return t.locationManager;
  if (role === "VALET_SUPERVISOR") return t.supervisor;
  return t.employee;
}

export function staffStatusLabel(
  status: "PENDING" | "ACTIVE" | "INACTIVE",
  t: AdministrationCopy,
  locale: "en" | "ar",
): string {
  if (status === "PENDING") return staffOnboardingCopy(locale).pending;
  return status === "ACTIVE" ? t.active : t.inactive;
}
