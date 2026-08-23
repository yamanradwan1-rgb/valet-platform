import type { IncidentSeverity, IncidentType } from "@valet/contracts";

import type { EmployeeDictionary } from "../../lib/i18n/dictionary";

export function presentIncidentType(
  type: IncidentType,
  t: EmployeeDictionary,
): string {
  const labels: Record<IncidentType, string> = {
    CUSTOMER_COMPLAINT: t.customerComplaint,
    EMPLOYEE_SAFETY: t.employeeSafety,
    KEY_DAMAGED: t.keyDamaged,
    KEY_LOCKED_INSIDE: t.keyLockedInside,
    KEY_MISSING: t.keyMissing,
    OTHER: t.other,
    PAYMENT_DISPUTE: t.paymentDispute,
    SYSTEM_CONNECTION: t.systemConnection,
    UNAUTHORIZED_ZONE_EXIT: t.unauthorizedZoneExit,
    VEHICLE_DAMAGE: t.vehicleDamage,
    WRONG_KEY: t.wrongKey,
    WRONG_VEHICLE_HANDOFF_ATTEMPT: t.wrongVehicleHandoff,
  };
  return labels[type];
}

export function presentIncidentSeverity(
  severity: IncidentSeverity,
  t: EmployeeDictionary,
): string {
  const labels: Record<IncidentSeverity, string> = {
    CRITICAL: t.critical,
    HIGH: t.high,
    LOW: t.low,
    MEDIUM: t.medium,
  };
  return labels[severity];
}
