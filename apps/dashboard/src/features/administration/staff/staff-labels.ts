import type { StaffManagementRole } from "@valet/contracts";

import type { AdministrationCopy } from "../administration-copy";

export function staffRoleLabel(role: StaffManagementRole, t: AdministrationCopy): string {
  if (role === "ORG_ADMIN") return t.companyAdmin;
  if (role === "LOCATION_MANAGER") return t.locationManager;
  if (role === "VALET_SUPERVISOR") return t.supervisor;
  return t.employee;
}

export function staffStatusLabel(status: "ACTIVE" | "INACTIVE", t: AdministrationCopy): string {
  return status === "ACTIVE" ? t.active : t.inactive;
}
